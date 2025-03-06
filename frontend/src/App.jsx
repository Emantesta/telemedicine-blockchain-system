import React, { useState, useEffect, useRef } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Web3 from 'web3';
import QRCode from 'react-qr-code';

const App = ({ account, signer, token }) => {
  const [role, setRole] = useState('patient');
  const [appointments, setAppointments] = useState([]);
  const [labTests, setLabTests] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [aiAnalyses, setAIAnalyses] = useState([]);
  const [dataStatus, setDataStatus] = useState({ dataSharing: false, lastRewardTimestamp: 0 });
  const ws = useRef(null);
  const web3 = new Web3(process.env.REACT_APP_SONIC_RPC_URL);

  const appointmentSchema = Yup.object({
    doctorAddress: Yup.string().matches(/^0x[a-fA-F0-9]{40}$/, 'Invalid address').required(),
    timestamp: Yup.number().min(Math.floor(Date.now() / 1000) + 900).required(),
    paymentType: Yup.number().min(0).max(2).required(),
    isVideoCall: Yup.boolean(),
    videoCallLink: Yup.string().when('isVideoCall', { is: true, then: Yup.string().required() })
  });

  const aiSchema = Yup.object({
    symptoms: Yup.string().required('Symptoms required')
  });

  const labTestSchema = Yup.object({
    patientAddress: Yup.string().matches(/^0x[a-fA-F0-9]{40}$/, 'Invalid address').required(),
    testType: Yup.string().required()
  });

  useEffect(() => {
    ws.current = new WebSocket('wss://localhost:8080');
    ws.current.onopen = () => toast.info('Connected to server');
    ws.current.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'appointmentUpdate') setAppointments(data.data);
    };
    fetchData();
    fetchDataStatus();
    return () => ws.current.close();
  }, []);

  const fetchData = async () => {
    try {
      const [aptRes, labRes, presRes, aiRes] = await Promise.all([
        axios.get(`${process.env.REACT_APP_API_URL}/appointments/${account}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${process.env.REACT_APP_API_URL}/lab-test/1`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${process.env.REACT_APP_API_URL}/prescription/1`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${process.env.REACT_APP_API_URL}/ai-analysis/1`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setAppointments(aptRes.data.appointments);
      setLabTests([labRes.data.labTest]);
      setPrescriptions([presRes.data.prescription]);
      setAIAnalyses([aiRes.data.analysis]);
    } catch (error) {
      toast.error('Failed to fetch data');
    }
  };

  const fetchDataStatus = async () => {
    const { data } = await axios.get(`${process.env.REACT_APP_API_URL}/data-status/${account}`, { headers: { Authorization: `Bearer ${token}` } });
    setDataStatus(data);
  };

  const bookAppointment = async (values) => {
    const signature = await signer.signMessage('Book Appointment');
    const { data } = await axios.post(`${process.env.REACT_APP_API_URL}/book-appointment`, { ...values, signature }, { headers: { Authorization: `Bearer ${token}` } });
    toast.success('Appointment booked');
    fetchData();
  };

  const confirmAppointment = async (appointmentId) => {
    const signature = await signer.signMessage('Confirm Appointment');
    const { data } = await axios.post(`${process.env.REACT_APP_API_URL}/confirm-appointment`, { appointmentId, signature }, { headers: { Authorization: `Bearer ${token}` } });
    toast.success('Appointment confirmed');
    fetchData();
  };

  const analyzeSymptoms = async (values) => {
    const signature = await signer.signMessage('Analyze Symptoms');
    const { data } = await axios.post(`${process.env.REACT_APP_API_URL}/analyze-symptoms`, { ...values, signature }, { headers: { Authorization: `Bearer ${token}` } });
    toast.success('AI analysis requested');
    fetchData();
  };

  const toggleDataMonetization = async (enable) => {
    const signature = await signer.signMessage('Toggle Data Monetization');
    const { data } = await axios.post(`${process.env.REACT_APP_API_URL}/toggle-data-monetization`, { enable, signature }, { headers: { Authorization: `Bearer ${token}` } });
    toast.success(`Data monetization ${enable ? 'enabled' : 'disabled'}`);
    fetchDataStatus();
  };

  const claimDataReward = async () => {
    const signature = await signer.signMessage('Claim Data Reward');
    const { data } = await axios.post(`${process.env.REACT_APP_API_URL}/claim-data-reward`, { signature }, { headers: { Authorization: `Bearer ${token}` } });
    toast.success('Data reward claimed');
    fetchDataStatus();
  };

  const reviewAIAnalysis = async (aiAnalysisId, analysisIpfsHash) => {
    const signature = await signer.signMessage('Review AI Analysis');
    const { data } = await axios.post(`${process.env.REACT_APP_API_URL}/review-ai-analysis`, { aiAnalysisId, analysisIpfsHash, signature }, { headers: { Authorization: `Bearer ${token}` } });
    toast.success('AI analysis reviewed');
    fetchData();
  };

  const orderLabTest = async (values) => {
    const signature = await signer.signMessage('Order Lab Test');
    const { data } = await axios.post(`${process.env.REACT_APP_API_URL}/order-lab-test`, { ...values, signature }, { headers: { Authorization: `Bearer ${token}` } });
    toast.success('Lab test ordered');
    fetchData();
  };

  const collectSample = async (labTestId, ipfsHash) => {
    const signature = await signer.signMessage('Collect Sample');
    const { data } = await axios.post(`${process.env.REACT_APP_API_URL}/collect-sample`, { labTestId, ipfsHash, signature }, { headers: { Authorization: `Bearer ${token}` } });
    toast.success('Sample collected');
    fetchData();
  };

  const uploadLabResults = async (labTestId, resultsIpfsHash) => {
    const signature = await signer.signMessage('Upload Lab Results');
    const { data } = await axios.post(`${process.env.REACT_APP_API_URL}/upload-lab-results`, { labTestId, resultsIpfsHash, signature }, { headers: { Authorization: `Bearer ${token}` } });
    toast.success('Results uploaded');
    fetchData();
  };

  const reviewLabResults = async (labTestId, medicationDetails, prescriptionIpfsHash) => {
    const signature = await signer.signMessage('Review Lab Results');
    const { data } = await axios.post(`${process.env.REACT_APP_API_URL}/review-lab-results`, { labTestId, medicationDetails, prescriptionIpfsHash, signature }, { headers: { Authorization: `Bearer ${token}` } });
    toast.success('Results reviewed');
    fetchData();
  };

  const verifyPrescription = async (prescriptionId, verificationCodeHash) => {
    const signature = await signer.signMessage('Verify Prescription');
    const { data } = await axios.post(`${process.env.REACT_APP_API_URL}/verify-prescription`, { prescriptionId, verificationCodeHash, signature }, { headers: { Authorization: `Bearer ${token}` } });
    toast.success('Prescription verified');
    fetchData();
  };

  const fulfillPrescription = async (prescriptionId) => {
    const signature = await signer.signMessage('Fulfill Prescription');
    const { data } = await axios.post(`${process.env.REACT_APP_API_URL}/fulfill-prescription`, { prescriptionId, signature }, { headers: { Authorization: `Bearer ${token}` } });
    toast.success('Prescription fulfilled');
    fetchData();
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl mb-4">Telemedicine System</h1>
      <select onChange={(e) => setRole(e.target.value)} className="mb-4 p-2 border">
        <option value="patient">Patient</option>
        <option value="doctor">Doctor</option>
        <option value="labTech">Lab Technician</option>
        <option value="pharmacy">Pharmacy</option>
      </select>

      {role === 'patient' && (
        <>
          <Formik initialValues={{ doctorAddress: '', timestamp: '', paymentType: 0, isVideoCall: false, videoCallLink: '' }} validationSchema={appointmentSchema} onSubmit={bookAppointment}>
            {({ isSubmitting, values }) => (
              <Form className="space-y-4">
                <div><Field name="doctorAddress" placeholder="Doctor Address" className="w-full p-2 border" /><ErrorMessage name="doctorAddress" component="div" className="text-red-500" /></div>
                <div><Field name="timestamp" type="number" placeholder="Timestamp" className="w-full p-2 border" /><ErrorMessage name="timestamp" component="div" className="text-red-500" /></div>
                <div><Field name="paymentType" as="select" className="w-full p-2 border"><option value={0}>ETH</option><option value={1}>USDC</option><option value={2}>SONIC</option></Field></div>
                <div><Field name="isVideoCall" type="checkbox" /><label>Video Call</label></div>
                {values.isVideoCall && <div><Field name="videoCallLink" placeholder="Video Call Link" className="w-full p-2 border" /><ErrorMessage name="videoCallLink" component="div" className="text-red-500" /></div>}
                <button type="submit" disabled={isSubmitting} className="bg-blue-500 text-white p-2 rounded">Book Appointment</button>
              </Form>
            )}
          </Formik>
          <Formik initialValues={{ symptoms: '' }} validationSchema={aiSchema} onSubmit={analyzeSymptoms}>
            {({ isSubmitting }) => (
              <Form className="space-y-4 mt-4">
                <div><Field name="symptoms" placeholder="Symptoms" className="w-full p-2 border" /><ErrorMessage name="symptoms" component="div" className="text-red-500" /></div>
                <button type="submit" disabled={isSubmitting} className="bg-green-500 text-white p-2 rounded">Analyze Symptoms</button>
              </Form>
            )}
          </Formik>
          <div className="mt-4">
            <h2 className="text-xl">Data Monetization</h2>
            <p>Data Sharing: {dataStatus.dataSharing ? 'Enabled' : 'Disabled'}</p>
            <p>Last Reward: {new Date(dataStatus.lastRewardTimestamp * 1000).toLocaleString()}</p>
            <button onClick={() => toggleDataMonetization(!dataStatus.dataSharing)} className="bg-yellow-500 text-white p-2 rounded mt-2">
              {dataStatus.dataSharing ? 'Disable' : 'Enable'} Data Sharing
            </button>
            <button onClick={claimDataReward} className="bg-green-500 text-white p-2 rounded mt-2 ml-2">Claim Reward</button>
          </div>
        </>
      )}

      {role === 'doctor' && (
        <>
          <Formik initialValues={{ patientAddress: '', testType: '' }} validationSchema={labTestSchema} onSubmit={orderLabTest}>
            {({ isSubmitting }) => (
              <Form className="space-y-4">
                <div><Field name="patientAddress" placeholder="Patient Address" className="w-full p-2 border" /><ErrorMessage name="patientAddress" component="div" className="text-red-500" /></div>
                <div><Field name="testType" placeholder="Test Type" className="w-full p-2 border" /><ErrorMessage name="testType" component="div" className="text-red-500" /></div>
                <button type="submit" disabled={isSubmitting} className="bg-blue-500 text-white p-2 rounded">Order Lab Test</button>
              </Form>
            )}
          </Formik>
          {appointments.map(apt => (
            <div key={apt[0]} className="p-4 border mt-2">
              <p>ID: {apt[0]}</p>
              <p>Status: {['Pending', 'Confirmed', 'Completed', 'Cancelled', 'Emergency'][apt[4]]}</p>
              {apt[7] && <a href={apt[7]} target="_blank" className="text-blue-500">Join Video Call</a>}
              {apt[4] === 0 && <button onClick={() => confirmAppointment(apt[0])} className="bg-green-500 text-white p-2 rounded mt-2">Confirm</button>}
            </div>
          ))}
          {aiAnalyses.map(ai => !ai[4] && (
            <div key={ai[0]} className="p-4 border mt-2">
              <p>ID: {ai[0]}</p>
              <p>Symptoms: {ai[2]}</p>
              <button onClick={() => reviewAIAnalysis(ai[0], 'ipfs-hash')} className="bg-yellow-500 text-white p-2 rounded">Review AI Analysis</button>
            </div>
          ))}
          {labTests.map(test => test[4] === 2 && (
            <div key={test[0]} className="p-4 border mt-2">
              <p>ID: {test[0]}</p>
              <button onClick={() => reviewLabResults(test[0], 'Medication Details', 'prescription-ipfs-hash')} className="bg-blue-500 text-white p-2 rounded">Review Results</button>
            </div>
          ))}
        </>
      )}

      {role === 'labTech' && labTests.map(test => (
        <div key={test[0]} className="p-4 border mt-2">
          <p>ID: {test[0]}</p>
          <p>Status: {['Requested', 'Collected', 'ResultsUploaded', 'Reviewed'][test[4]]}</p>
          {test[4] === 0 && <button onClick={() => collectSample(test[0], 'ipfs-hash')} className="bg-green-500 text-white p-2 rounded">Collect Sample</button>}
          {test[4] === 1 && <button onClick={() => uploadLabResults(test[0], 'results-ipfs-hash')} className="bg-green-500 text-white p-2 rounded">Upload Results</button>}
        </div>
      ))}

      {role === 'pharmacy' && prescriptions.map(pres => (
        <div key={pres[0]} className="p-4 border mt-2">
          <p>ID: {pres[0]}</p>
          <p>Status: {['Generated', 'Verified', 'Fulfilled'][pres[6]]}</p>
          {pres[6] === 0 && (
            <>
              <QRCode value={JSON.stringify({ id: pres[0].toString(), verificationCodeHash: ethers.utils.hexlify(pres[3]) })} />
              <button onClick={() => verifyPrescription(pres[0], pres[3])} className="bg-yellow-500 text-white p-2 rounded mt-2">Verify</button>
            </>
          )}
          {pres[6] === 1 && <button onClick={() => fulfillPrescription(pres[0])} className="bg-green-500 text-white p-2 rounded">Fulfill</button>}
        </div>
      ))}
    </div>
  );
};

export default App;
