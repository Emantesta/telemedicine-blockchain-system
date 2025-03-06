const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("TelemedicineSystem", function () {
  let TelemedicineSystem, telemedicine, owner, patient, doctor, labTech, pharmacy;
  let usdcToken, sonicToken, ethUsdPriceFeed, sonicUsdPriceFeed, entryPoint;

  const encryptedSymmetricKey = "encryptedKey123";
  const doctorLicense = "DOC123";
  const labTechLicense = "LAB123";
  const pharmacyLicense = "PHARM123";
  const consultationFee = ethers.utils.parseEther("0.1");

  beforeEach(async function () {
    [owner, patient, doctor, labTech, pharmacy] = await ethers.getSigners();

    // Mock ERC20 tokens
    const ERC20 = await ethers.getContractFactory("MockERC20");
    usdcToken = await ERC20.deploy("USDC", "USDC", ethers.utils.parseUnits("1000", 18));
    sonicToken = await ERC20.deploy("SONIC", "SONIC", ethers.utils.parseUnits("1000", 18));
    await usdcToken.deployed();
    await sonicToken.deployed();

    // Mock Chainlink price feeds
    const PriceFeed = await ethers.getContractFactory("MockPriceFeed");
    ethUsdPriceFeed = await PriceFeed.deploy(2000 * 10**8); // 2000 USD/ETH
    sonicUsdPriceFeed = await PriceFeed.deploy(1 * 10**8);  // 1 USD/SONIC
    await ethUsdPriceFeed.deployed();
    await sonicUsdPriceFeed.deployed();

    // Mock EntryPoint
    const EntryPoint = await ethers.getContractFactory("MockEntryPoint");
    entryPoint = await EntryPoint.deploy();
    await entryPoint.deployed();

    // Deploy TelemedicineSystem
    TelemedicineSystem = await ethers.getContractFactory("TelemedicineSystem");
    telemedicine = await upgrades.deployProxy(TelemedicineSystem, [
      usdcToken.address,
      sonicToken.address,
      ethUsdPriceFeed.address,
      sonicUsdPriceFeed.address,
      entryPoint.address
    ], { initializer: "initialize" });
    await telemedicine.deployed();

    // Grant roles
    await telemedicine.grantRole(await telemedicine.ADMIN_ROLE(), owner.address);
  });

  describe("Initialization", function () {
    it("should initialize correctly", async function () {
      expect(await telemedicine.usdcToken()).to.equal(usdcToken.address);
      expect(await telemedicine.sonicToken()).to.equal(sonicToken.address);
      expect(await telemedicine.ethUsdPriceFeed()).to.equal(ethUsdPriceFeed.address);
      expect(await telemedicine.sonicUsdPriceFeed()).to.equal(sonicUsdPriceFeed.address);
      expect(await telemedicine.entryPoint()).to.equal(entryPoint.address);
      expect(await telemedicine.hasRole(await telemedicine.ADMIN_ROLE(), owner.address)).to.be.true;
    });
  });

  describe("Patient Registration", function () {
    it("should register a patient", async function () {
      await telemedicine.connect(patient).registerPatient(encryptedSymmetricKey);
      const patientData = await telemedicine.patients(patient.address);
      expect(patientData.isRegistered).to.be.true;
      expect(patientData.encryptedSymmetricKey).to.equal(encryptedSymmetricKey);
      expect(await telemedicine.hasRole(await telemedicine.PATIENT_ROLE(), patient.address)).to.be.true;
    });

    it("should revert if patient is already registered", async function () {
      await telemedicine.connect(patient).registerPatient(encryptedSymmetricKey);
      await expect(telemedicine.connect(patient).registerPatient(encryptedSymmetricKey))
        .to.be.revertedWith("Already registered");
    });
  });

  describe("Doctor Verification", function () {
    it("should verify a doctor", async function () {
      await telemedicine.verifyDoctor(doctor.address, doctorLicense, consultationFee);
      const doctorData = await telemedicine.doctors(doctor.address);
      expect(doctorData.isVerified).to.be.true;
      expect(doctorData.consultationFee).to.equal(consultationFee);
      expect(doctorData.licenseNumber).to.equal(doctorLicense);
      expect(await telemedicine.hasRole(await telemedicine.DOCTOR_ROLE(), doctor.address)).to.be.true;
    });
  });

  describe("Appointment Booking", function () {
    beforeEach(async function () {
      await telemedicine.verifyDoctor(doctor.address, doctorLicense, consultationFee);
      await telemedicine.connect(patient).registerPatient(encryptedSymmetricKey);
    });

    it("should book an appointment with ETH", async function () {
      const timestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      await expect(telemedicine.connect(patient).bookAppointment(
        doctor.address, timestamp, 0, true, "zoom.link", { value: consultationFee }
      )).to.emit(telemedicine, "AppointmentBooked");
      const appointment = await telemedicine.appointments(1);
      expect(appointment.patient).to.equal(patient.address);
      expect(appointment.doctor).to.equal(doctor.address);
      expect(appointment.fee).to.equal(consultationFee);
    });

    it("should revert if doctor is not verified", async function () {
      const timestamp = Math.floor(Date.now() / 1000) + 3600;
      await expect(telemedicine.connect(patient).bookAppointment(
        labTech.address, timestamp, 0, true, "zoom.link", { value: consultationFee }
      )).to.be.revertedWith("Doctor not verified");
    });
  });

  describe("Data Monetization", function () {
    beforeEach(async function () {
      await telemedicine.connect(patient).registerPatient(encryptedSymmetricKey);
      await sonicToken.transfer(telemedicine.address, ethers.utils.parseUnits("100", 18));
    });

    it("should enable data monetization and claim reward", async function () {
      await telemedicine.connect(patient).toggleDataMonetization(true);
      const [dataSharing] = await telemedicine.getPatientDataStatus(patient.address);
      expect(dataSharing).to.equal(1); // Enabled

      await telemedicine.connect(patient).claimDataReward();
      expect(await sonicToken.balanceOf(patient.address)).to.equal(ethers.utils.parseUnits("10", 18));
    });

    it("should revert if data sharing is not enabled", async function () {
      await expect(telemedicine.connect(patient).claimDataReward())
        .to.be.revertedWith("Data sharing not enabled");
    });
  });

  describe("Account Abstraction", function () {
    it("should handle user operation", async function () {
      const userOp = {
        sender: patient.address,
        nonce: 0,
        callData: telemedicine.interface.encodeFunctionData("registerPatient", [encryptedSymmetricKey]),
        callGasLimit: 200000,
        verificationGasLimit: 100000,
        preVerificationGas: 21000,
        maxFeePerGas: ethers.utils.parseUnits("1", "gwei"),
        maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei"),
        signature: "0x"
      };
      await expect(telemedicine.connect(entryPoint).handleUserOp(userOp))
        .to.not.be.reverted;
      const patientData = await telemedicine.patients(patient.address);
      expect(patientData.isRegistered).to.be.true;
    });
  });
});

// Mock contracts for testing
const { deployMockContract } = require("@ethereum-waffle/mock-contract");
const IERC20 = require("@openzeppelin/contracts/build/contracts/IERC20.json");
const AggregatorV3Interface = require("@chainlink/contracts/abi/v0.8/AggregatorV3Interface.json");

async function deployMocks() {
  const [deployer] = await ethers.getSigners();
  const usdc = await deployMockContract(deployer, IERC20.abi);
  const sonic = await deployMockContract(deployer, IERC20.abi);
  const ethFeed = await deployMockContract(deployer, AggregatorV3Interface.abi);
  const sonicFeed = await deployMockContract(deployer, AggregatorV3Interface.abi);
  const entry = await deployMockContract(deployer, ["function handleOps(tuple,address)"]);
  return { usdc, sonic, ethFeed, sonicFeed, entry };
}
