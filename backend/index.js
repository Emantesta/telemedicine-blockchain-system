require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const cors = require('cors');
const { create } = require('ipfs-http-client');
const QRCode = require('qrcode');
const tf = require('@tensorflow/tfjs-node');
const { UserOperation } = require('@account-abstraction/utils');

const app = express();
const server = https.createServer({
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
});
const wss = new WebSocket.Server({ server });
const ipfs = create({ host: 'ipfs.infura.io', port: 5001, protocol: 'https' });

const provider = new ethers.providers.JsonRpcProvider(process.env.SONIC_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, [
    'function registerPatient(string)',
    'function verifyDoctor(address, string, uint256)',
    'function verifyLabTechnician(address, string)',
    'function registerPharmacy(address, string)',
    'function bookAppointment(address, uint48, uint8, bool, string) payable',
    'function confirmAppointment(uint256)',
    'function requestAISymptomAnalysis(string)',
    'function reviewAISymptomAnalysis(uint256, string)',
    'function orderLabTest(address, string)',
    'function collectSample(uint256, string)',
    'function uploadLabResults(uint256, string)',
    'function reviewLabResults(uint256, string, string)',
    'function verifyPrescription(uint256, bytes32)',
    'function fulfillPrescription(uint256)',
    'function toggleDataMonetization(bool)',
    'function claimDataReward()',
    'function handleUserOp(tuple(address, uint256, bytes, uint256, uint256, uint256, uint256, uint256, bytes))',
    'function getPatientAppointments(address) view returns (tuple(uint256, address, address, uint48, uint8, uint256, uint8, string, bool)[])',
    'function getLabTestDetails(uint256) view returns (tuple(uint256, address, address, address, uint8, string, string, string, uint48, uint48))',
    'function getPrescriptionDetails(uint256) view returns (tuple(uint256, address, address, bytes32, string, string, uint8, address, uint48, uint48))',
    'function getAIAnalysisDetails(uint256) view returns (tuple(uint256, address, string, string, bool))',
    'function getPatientDataStatus(address) view returns (uint8, uint256)'
], wallet);

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.Console()
    ]
});

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        if (!token) throw new Error('Token required');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        logger.error('Auth error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

// AI Symptom Analysis (Simple Mock Model)
async function analyzeSymptoms(symptoms) {
    const tensor = tf.tensor([symptoms.split(' ').length]);
    const prediction = tensor.add(0.5); // Mock AI logic
    return { diagnosis: "Possible condition based on: " + symptoms, confidence: prediction.dataSync()[0] };
}

// Account Abstraction Helper
async function submitUserOperation(userOp) {
    const tx = await contract.handleUserOp(userOp);
    await tx.wait();
    return tx.hash;
}

// Routes
app.post('/login', async (req, res) => {
    try {
        const { address, signature } = req.body;
        const recovered = ethers.utils.verifyMessage('Telemedicine Login', signature);
        if (recovered !== address) throw new Error('Invalid signature');
        const token = jwt.sign({ address }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        res.status(401).json({ error: 'Login failed' });
    }
});

app.post('/register-patient', authMiddleware, async (req, res) => {
    const tx = await contract.registerPatient(req.body.encryptedSymmetricKey);
    await tx.wait();
    res.json({ txHash: tx.hash });
});

app.post('/book-appointment', authMiddleware, async (req, res) => {
    const { doctorAddress, timestamp, paymentType, isVideoCall, videoCallLink, userOp } = req.body;
    if (userOp) {
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
    } else {
        const tx = await contract.bookAppointment(doctorAddress, timestamp, paymentType, isVideoCall, videoCallLink || "", {
            value: paymentType === 0 ? ethers.utils.parseEther("0.1") : 0
        });
        await tx.wait();
        wss.clients.forEach(client => client.send(JSON.stringify({ type: 'appointment', id: tx.hash })));
        res.json({ txHash: tx.hash });
    }
});

app.post('/confirm-appointment', authMiddleware, async (req, res) => {
    const { appointmentId } = req.body;
    const tx = await contract.confirmAppointment(appointmentId);
    await tx.wait();
    wss.clients.forEach(client => client.send(JSON.stringify({ type: 'appointmentConfirmed', id: appointmentId })));
    res.json({ txHash: tx.hash });
});

app.post('/analyze-symptoms', authMiddleware, async (req, res) => {
    const { symptoms, userOp } = req.body;
    if (userOp) {
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
    } else {
        const analysis = await analyzeSymptoms(symptoms);
        const ipfsResult = await ipfs.add(JSON.stringify(analysis));
        const tx = await contract.requestAISymptomAnalysis(symptoms);
        await tx.wait();
        res.json({ txHash: tx.hash, ipfsHash: ipfsResult.path });
    }
});

app.post('/toggle-data-monetization', authMiddleware, async (req, res) => {
    const { enable } = req.body;
    const tx = await contract.toggleDataMonetization(enable);
    await tx.wait();
    res.json({ txHash: tx.hash });
});

app.post('/claim-data-reward', authMiddleware, async (req, res) => {
    const tx = await contract.claimDataReward();
    await tx.wait();
    res.json({ txHash: tx.hash });
});

app.post('/review-ai-analysis', authMiddleware, async (req, res) => {
    const { aiAnalysisId, analysisIpfsHash } = req.body;
    const tx = await contract.reviewAISymptomAnalysis(aiAnalysisId, analysisIpfsHash);
    await tx.wait();
    res.json({ txHash: tx.hash });
});

app.post('/order-lab-test', authMiddleware, async (req, res) => {
    const { patientAddress, testType } = req.body;
    const tx = await contract.orderLabTest(patientAddress, testType);
    await tx.wait();
    res.json({ txHash: tx.hash });
});

app.post('/collect-sample', authMiddleware, async (req, res) => {
    const { labTestId, ipfsHash } = req.body;
    const tx = await contract.collectSample(labTestId, ipfsHash);
    await tx.wait();
    res.json({ txHash: tx.hash });
});

app.post('/upload-lab-results', authMiddleware, async (req, res) => {
    const { labTestId, resultsIpfsHash } = req.body;
    const tx = await contract.uploadLabResults(labTestId, resultsIpfsHash);
    await tx.wait();
    res.json({ txHash: tx.hash });
});

app.post('/review-lab-results', authMiddleware, async (req, res) => {
    const { labTestId, medicationDetails, prescriptionIpfsHash } = req.body;
    const tx = await contract.reviewLabResults(labTestId, medicationDetails, prescriptionIpfsHash);
    await tx.wait();
    res.json({ txHash: tx.hash });
});

app.post('/verify-prescription', authMiddleware, async (req, res) => {
    const { prescriptionId, verificationCodeHash } = req.body;
    const tx = await contract.verifyPrescription(prescriptionId, ethers.utils.hexlify(verificationCodeHash));
    await tx.wait();
    res.json({ txHash: tx.hash });
});

app.post('/fulfill-prescription', authMiddleware, async (req, res) => {
    const { prescriptionId } = req.body;
    const tx = await contract.fulfillPrescription(prescriptionId);
    await tx.wait();
    res.json({ txHash: tx.hash });
});

app.get('/generate-qr/:prescriptionId', authMiddleware, async (req, res) => {
    const prescription = await contract.getPrescriptionDetails(req.params.prescriptionId);
    const qrData = JSON.stringify({
        id: prescription[0].toString(),
        verificationCodeHash: ethers.utils.hexlify(prescription[3])
    });
    const qrCode = await QRCode.toDataURL(qrData);
    res.json({ qrCode });
});

app.get('/appointments/:address', authMiddleware, async (req, res) => {
    const appointments = await contract.getPatientAppointments(req.params.address);
    res.json({ appointments });
});

app.get('/lab-test/:id', async (req, res) => {
    const labTest = await contract.getLabTestDetails(req.params.id);
    res.json({ labTest });
});

app.get('/prescription/:id', async (req, res) => {
    const prescription = await contract.getPrescriptionDetails(req.params.id);
    res.json({ prescription });
});

app.get('/ai-analysis/:id', async (req, res) => {
    const analysis = await contract.getAIAnalysisDetails(req.params.id);
    res.json({ analysis });
});

app.get('/data-status/:address', async (req, res) => {
    const [dataSharing, lastRewardTimestamp] = await contract.getPatientDataStatus(req.params.address);
    res.json({ dataSharing: dataSharing === 1, lastRewardTimestamp });
});

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        if (data.type === 'appointment') {
            const appointment = await contract.getPatientAppointments(data.address);
            ws.send(JSON.stringify({ type: 'appointmentUpdate', data: appointment }));
        }
    });
});

server.listen(8080, () => logger.info('Server running on port 8080'));
