const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy mock dependencies (replace with real addresses on testnet)
  const ERC20 = await ethers.getContractFactory("MockERC20");
  const usdcToken = await ERC20.deploy("USDC", "USDC", ethers.utils.parseUnits("1000", 18));
  const sonicToken = await ERC20.deploy("SONIC", "SONIC", ethers.utils.parseUnits("1000", 18));
  await usdcToken.deployed();
  await sonicToken.deployed();

  const PriceFeed = await ethers.getContractFactory("MockPriceFeed");
  const ethUsdPriceFeed = await PriceFeed.deploy(2000 * 10**8);
  const sonicUsdPriceFeed = await PriceFeed.deploy(1 * 10**8);
  await ethUsdPriceFeed.deployed();
  await sonicUsdPriceFeed.deployed();

  const EntryPoint = await ethers.getContractFactory("MockEntryPoint");
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.deployed();

  // Deploy TelemedicineSystem
  const TelemedicineSystem = await ethers.getContractFactory("TelemedicineSystem");
  const telemedicine = await upgrades.deployProxy(TelemedicineSystem, [
    usdcToken.address,
    sonicToken.address,
    ethUsdPriceFeed.address,
    sonicUsdPriceFeed.address,
    entryPoint.address
  ], { initializer: "initialize" });
  await telemedicine.deployed();

  console.log("TelemedicineSystem deployed to:", telemedicine.address);
  console.log("USDC Token:", usdcToken.address);
  console.log("SONIC Token:", sonicToken.address);
  console.log("ETH/USD Price Feed:", ethUsdPriceFeed.address);
  console.log("SONIC/USD Price Feed:", sonicUsdPriceFeed.address);
  console.log("EntryPoint:", entryPoint.address);

  // Fund contract with SONIC tokens for data monetization
  await sonicToken.transfer(telemedicine.address, ethers.utils.parseUnits("100", 18));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
