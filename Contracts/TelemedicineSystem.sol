// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

contract TelemedicineSystem is Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using AddressUpgradeable for address payable;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant DOCTOR_ROLE = keccak256("DOCTOR_ROLE");
    bytes32 public constant PATIENT_ROLE = keccak256("PATIENT_ROLE");
    bytes32 public constant LAB_TECH_ROLE = keccak256("LAB_TECH_ROLE");
    bytes32 public constant PHARMACY_ROLE = keccak256("PHARMACY_ROLE");

    IERC20Upgradeable public usdcToken;
    IERC20Upgradeable public sonicToken;
    AggregatorV3Interface public ethUsdPriceFeed;
    AggregatorV3Interface public sonicUsdPriceFeed;
    IEntryPoint public entryPoint; // Account abstraction entry point

    uint256 private constant MIN_BOOKING_BUFFER = 15 minutes;
    uint256 private constant MIN_CANCELLATION_BUFFER = 1 hours;
    uint256 private constant VERIFICATION_TIMEOUT = 7 days;
    uint256 private constant DATA_MONETIZATION_REWARD = 10 * 10**18; // 10 SONIC tokens

    enum AppointmentStatus { Pending, Confirmed, Completed, Cancelled, Emergency }
    enum PaymentType { ETH, USDC, SONIC }
    enum LabTestStatus { Requested, Collected, ResultsUploaded, Reviewed }
    enum PrescriptionStatus { Generated, Verified, Fulfilled }
    enum DataSharingStatus { Disabled, Enabled }

    struct GamificationData {
        uint96 mediPoints;
        uint8 currentLevel;
    }

    struct Patient {
        bool isRegistered;
        string encryptedSymmetricKey;
        bytes32 medicalHistoryHash;
        GamificationData gamification;
        DataSharingStatus dataSharing; // Opt-in for data monetization
        uint256 lastRewardTimestamp;
    }

    struct Doctor {
        bool isVerified;
        uint256 consultationFee;
        string licenseNumber;
    }

    struct LabTechnician {
        bool isVerified;
        string licenseNumber;
    }

    struct Pharmacy {
        bool isRegistered;
        string licenseNumber;
    }

    struct Appointment {
        uint256 id;
        address patient;
        address doctor;
        uint48 scheduledTimestamp;
        AppointmentStatus status;
        uint256 fee;
        PaymentType paymentType;
        string videoCallLink;
        bool isVideoCall;
    }

    struct LabTestOrder {
        uint256 id;
        address patient;
        address doctor;
        address labTech;
        LabTestStatus status;
        string testType;
        string sampleCollectionIpfsHash;
        string resultsIpfsHash;
        uint48 orderedTimestamp;
        uint48 completedTimestamp;
    }

    struct Prescription {
        uint256 id;
        address patient;
        address doctor;
        bytes32 verificationCodeHash;
        string medicationDetails;
        string prescriptionIpfsHash;
        PrescriptionStatus status;
        address pharmacy;
        uint48 generatedTimestamp;
        uint48 expirationTimestamp;
    }

    struct AISymptomAnalysis {
        uint256 id;
        address patient;
        string symptoms;
        string analysisIpfsHash;
        bool doctorReviewed;
    }

    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes signature;
    }

    mapping(address => Patient) public patients;
    mapping(address => Doctor) public doctors;
    mapping(address => LabTechnician) public labTechnicians;
    mapping(address => Pharmacy) public pharmacies;
    mapping(uint256 => Appointment) public appointments;
    mapping(uint256 => LabTestOrder) public labTestOrders;
    mapping(uint256 => Prescription) public prescriptions;
    mapping(uint256 => AISymptomAnalysis) public aiAnalyses;

    uint256 public appointmentCounter;
    uint256 public labTestCounter;
    uint256 public prescriptionCounter;
    uint256 public aiAnalysisCounter;

    event PatientRegistered(address indexed patient);
    event DoctorVerified(address indexed doctor);
    event LabTechnicianVerified(address indexed labTech);
    event PharmacyRegistered(address indexed pharmacy);
    event AppointmentBooked(uint256 indexed id, address indexed patient);
    event LabTestOrdered(uint256 indexed id, address indexed patient);
    event LabTestResultsUploaded(uint256 indexed id, string ipfsHash);
    event PrescriptionGenerated(uint256 indexed id, address indexed patient);
    event PrescriptionVerified(uint256 indexed id, address indexed pharmacy);
    event PrescriptionFulfilled(uint256 indexed id, address indexed pharmacy);
    event AISymptomAnalyzed(uint256 indexed id, address indexed patient);
    event VideoCallStarted(uint256 indexed appointmentId, string videoCallLink);
    event DataMonetizationOptIn(address indexed patient, bool enabled);
    event DataRewardClaimed(address indexed patient, uint256 amount);

    function initialize(
        address _usdcToken,
        address _sonicToken,
        address _ethUsdPriceFeed,
        address _sonicUsdPriceFeed,
        address _entryPoint
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(DOCTOR_ROLE, ADMIN_ROLE);
        _setRoleAdmin(PATIENT_ROLE, ADMIN_ROLE);
        _setRoleAdmin(LAB_TECH_ROLE, ADMIN_ROLE);
        _setRoleAdmin(PHARMACY_ROLE, ADMIN_ROLE);
        _grantRole(ADMIN_ROLE, msg.sender);

        usdcToken = IERC20Upgradeable(_usdcToken);
        sonicToken = IERC20Upgradeable(_sonicToken);
        ethUsdPriceFeed = AggregatorV3Interface(_ethUsdPriceFeed);
        sonicUsdPriceFeed = AggregatorV3Interface(_sonicUsdPriceFeed);
        entryPoint = IEntryPoint(_entryPoint);
    }

    // Admin Functions
    function verifyDoctor(address _doctor, string calldata _licenseNumber, uint256 _fee) external onlyRole(ADMIN_ROLE) {
        doctors[_doctor] = Doctor(true, _fee, _licenseNumber);
        _grantRole(DOCTOR_ROLE, _doctor);
        emit DoctorVerified(_doctor);
    }

    function verifyLabTechnician(address _labTech, string calldata _licenseNumber) external onlyRole(ADMIN_ROLE) {
        labTechnicians[_labTech] = LabTechnician(true, _licenseNumber);
        _grantRole(LAB_TECH_ROLE, _labTech);
        emit LabTechnicianVerified(_labTech);
    }

    function registerPharmacy(address _pharmacy, string calldata _licenseNumber) external onlyRole(ADMIN_ROLE) {
        pharmacies[_pharmacy] = Pharmacy(true, _licenseNumber);
        _grantRole(PHARMACY_ROLE, _pharmacy);
        emit PharmacyRegistered(_pharmacy);
    }

    // Patient Functions
    function registerPatient(string calldata _encryptedSymmetricKey) external whenNotPaused {
        require(!patients[msg.sender].isRegistered, "Already registered");
        patients[msg.sender] = Patient(true, _encryptedSymmetricKey, bytes32(0), GamificationData(0, 1), DataSharingStatus.Disabled, 0);
        _grantRole(PATIENT_ROLE, msg.sender);
        emit PatientRegistered(msg.sender);
    }

    function bookAppointment(
        address _doctor,
        uint48 _timestamp,
        PaymentType _paymentType,
        bool _isVideoCall,
        string calldata _videoCallLink
    ) external payable onlyRole(PATIENT_ROLE) nonReentrant {
        require(doctors[_doctor].isVerified, "Doctor not verified");
        require(_timestamp > block.timestamp + MIN_BOOKING_BUFFER, "Too soon");

        uint256 fee = doctors[_doctor].consultationFee;
        _processPayment(_paymentType, fee);

        appointmentCounter++;
        appointments[appointmentCounter] = Appointment(appointmentCounter, msg.sender, _doctor, _timestamp, AppointmentStatus.Pending, fee, _paymentType, _isVideoCall ? _videoCallLink : "", _isVideoCall);
        patients[msg.sender].gamification.mediPoints += 20;
        emit AppointmentBooked(appointmentCounter, msg.sender);
    }

    function requestAISymptomAnalysis(string calldata _symptoms) external onlyRole(PATIENT_ROLE) {
        aiAnalysisCounter++;
        aiAnalyses[aiAnalysisCounter] = AISymptomAnalysis(aiAnalysisCounter, msg.sender, _symptoms, "", false);
        patients[msg.sender].gamification.mediPoints += 10;
        emit AISymptomAnalyzed(aiAnalysisCounter, msg.sender);
        _monetizeData(msg.sender);
    }

    // Data Monetization Functions
    function toggleDataMonetization(bool _enable) external onlyRole(PATIENT_ROLE) {
        Patient storage patient = patients[msg.sender];
        require(patient.isRegistered, "Not registered");
        patient.dataSharing = _enable ? DataSharingStatus.Enabled : DataSharingStatus.Disabled;
        emit DataMonetizationOptIn(msg.sender, _enable);
    }

    function claimDataReward() external onlyRole(PATIENT_ROLE) nonReentrant {
        Patient storage patient = patients[msg.sender];
        require(patient.dataSharing == DataSharingStatus.Enabled, "Data sharing not enabled");
        require(block.timestamp >= patient.lastRewardTimestamp + 1 days, "Reward not yet available");
        require(sonicToken.balanceOf(address(this)) >= DATA_MONETIZATION_REWARD, "Insufficient SONIC tokens");

        patient.lastRewardTimestamp = block.timestamp;
        sonicToken.transfer(msg.sender, DATA_MONETIZATION_REWARD);
        emit DataRewardClaimed(msg.sender, DATA_MONETIZATION_REWARD);
    }

    // Account Abstraction Entry Point
    function handleUserOp(UserOperation calldata _userOp) external onlyEntryPoint {
        require(_userOp.sender == msg.sender || hasRole(PATIENT_ROLE, _userOp.sender), "Invalid sender");
        (bool success, bytes memory result) = address(this).call(_userOp.callData);
        require(success, "User operation failed");
        entryPoint.handleOps(_userOp, payable(msg.sender));
    }

    // Doctor Functions
    function confirmAppointment(uint256 _appointmentId) external onlyRole(DOCTOR_ROLE) {
        Appointment storage apt = appointments[_appointmentId];
        require(apt.doctor == msg.sender, "Not your appointment");
        require(apt.status == AppointmentStatus.Pending, "Not pending");
        apt.status = AppointmentStatus.Confirmed;
        if (apt.isVideoCall) emit VideoCallStarted(_appointmentId, apt.videoCallLink);
    }

    function orderLabTest(address _patient, string calldata _testType) external onlyRole(DOCTOR_ROLE) {
        require(patients[_patient].isRegistered, "Patient not registered");
        labTestCounter++;
        labTestOrders[labTestCounter] = LabTestOrder(labTestCounter, _patient, msg.sender, address(0), LabTestStatus.Requested, _testType, "", "", uint48(block.timestamp), 0);
        emit LabTestOrdered(labTestCounter, _patient);
        _monetizeData(_patient);
    }

    function reviewLabResults(uint256 _labTestId, string calldata _medicationDetails, string calldata _prescriptionIpfsHash) external onlyRole(DOCTOR_ROLE) {
        LabTestOrder storage order = labTestOrders[_labTestId];
        require(order.doctor == msg.sender, "Not your order");
        require(order.status == LabTestStatus.ResultsUploaded, "Results not uploaded");

        order.status = LabTestStatus.Reviewed;
        order.completedTimestamp = uint48(block.timestamp);

        prescriptionCounter++;
        bytes32 verificationCodeHash = keccak256(abi.encodePacked(prescriptionCounter, msg.sender, block.timestamp));
        prescriptions[prescriptionCounter] = Prescription(prescriptionCounter, order.patient, msg.sender, verificationCodeHash, _medicationDetails, _prescriptionIpfsHash, PrescriptionStatus.Generated, address(0), uint48(block.timestamp), uint48(block.timestamp + 30 days));
        emit PrescriptionGenerated(prescriptionCounter, order.patient);
        _monetizeData(order.patient);
    }

    function reviewAISymptomAnalysis(uint256 _aiAnalysisId, string calldata _analysisIpfsHash) external onlyRole(DOCTOR_ROLE) {
        AISymptomAnalysis storage analysis = aiAnalyses[_aiAnalysisId];
        require(!analysis.doctorReviewed, "Already reviewed");
        analysis.analysisIpfsHash = _analysisIpfsHash;
        analysis.doctorReviewed = true;
    }

    // Lab Technician Functions
    function collectSample(uint256 _labTestId, string calldata _ipfsHash) external onlyRole(LAB_TECH_ROLE) {
        LabTestOrder storage order = labTestOrders[_labTestId];
        require(order.status == LabTestStatus.Requested, "Invalid status");
        order.labTech = msg.sender;
        order.sampleCollectionIpfsHash = _ipfsHash;
        order.status = LabTestStatus.Collected;
    }

    function uploadLabResults(uint256 _labTestId, string calldata _resultsIpfsHash) external onlyRole(LAB_TECH_ROLE) {
        LabTestOrder storage order = labTestOrders[_labTestId];
        require(order.labTech == msg.sender, "Not your order");
        require(order.status == LabTestStatus.Collected, "Sample not collected");
        order.resultsIpfsHash = _resultsIpfsHash;
        order.status = LabTestStatus.ResultsUploaded;
        emit LabTestResultsUploaded(_labTestId, _resultsIpfsHash);
        _monetizeData(order.patient);
    }

    // Pharmacy Functions
    function verifyPrescription(uint256 _prescriptionId, bytes32 _verificationCodeHash) external onlyRole(PHARMACY_ROLE) {
        Prescription storage prescription = prescriptions[_prescriptionId];
        require(prescription.status == PrescriptionStatus.Generated, "Invalid status");
        require(prescription.verificationCodeHash == _verificationCodeHash, "Invalid code");
        prescription.status = PrescriptionStatus.Verified;
        prescription.pharmacy = msg.sender;
        emit PrescriptionVerified(_prescriptionId, msg.sender);
    }

    function fulfillPrescription(uint256 _prescriptionId) external onlyRole(PHARMACY_ROLE) {
        Prescription storage prescription = prescriptions[_prescriptionId];
        require(prescription.pharmacy == msg.sender, "Not your prescription");
        require(prescription.status == PrescriptionStatus.Verified, "Not verified");
        require(block.timestamp <= prescription.expirationTimestamp, "Expired");
        prescription.status = PrescriptionStatus.Fulfilled;
        emit PrescriptionFulfilled(_prescriptionId, msg.sender);
    }

    // Internal Functions
    function _processPayment(PaymentType _type, uint256 _amount) private {
        if (_type == PaymentType.ETH) {
            require(msg.value >= _amount, "Insufficient ETH");
            if (msg.value > _amount) payable(msg.sender).transfer(msg.value - _amount);
        } else if (_type == PaymentType.USDC) {
            require(usdcToken.transferFrom(msg.sender, address(this), _amount), "USDC transfer failed");
        } else {
            require(sonicToken.transferFrom(msg.sender, address(this), _amount), "SONIC transfer failed");
        }
    }

    function _monetizeData(address _patient) private {
        Patient storage patient = patients[_patient];
        if (patient.dataSharing == DataSharingStatus.Enabled && block.timestamp >= patient.lastRewardTimestamp + 1 days) {
            patient.lastRewardTimestamp = block.timestamp;
            sonicToken.transfer(_patient, DATA_MONETIZATION_REWARD);
            emit DataRewardClaimed(_patient, DATA_MONETIZATION_REWARD);
        }
    }

    // Modifiers
    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "Only entry point allowed");
        _;
    }

    // View Functions
    function getPatientAppointments(address _patient) external view returns (Appointment[] memory) {
        Appointment[] memory result = new Appointment[](appointmentCounter);
        uint256 count = 0;
        for (uint256 i = 1; i <= appointmentCounter; i++) {
            if (appointments[i].patient == _patient) {
                result[count] = appointments[i];
                count++;
            }
        }
        Appointment[] memory trimmed = new Appointment[](count);
        for (uint256 i = 0; i < count; i++) {
            trimmed[i] = result[i];
        }
        return trimmed;
    }

    function getLabTestDetails(uint256 _labTestId) external view returns (LabTestOrder memory) {
        return labTestOrders[_labTestId];
    }

    function getPrescriptionDetails(uint256 _prescriptionId) external view returns (Prescription memory) {
        return prescriptions[_prescriptionId];
    }

    function getAIAnalysisDetails(uint256 _aiAnalysisId) external view returns (AISymptomAnalysis memory) {
        return aiAnalyses[_aiAnalysisId];
    }

    function getPatientDataStatus(address _patient) external view returns (DataSharingStatus, uint256) {
        Patient memory patient = patients[_patient];
        return (patient.dataSharing, patient.lastRewardTimestamp);
    }
}
