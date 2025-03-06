require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require('dotenv').config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    sonicTestnet: {
      url: process.env.SONIC_RPC_URL || "https://sonic-testnet.rpc.soniclabs.io",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 64165
    }
  },
  etherscan: {
    apiKey: {
      sonicTestnet: process.env.SONICSCAN_API_KEY
    },
    customChains: [
      {
        network: "sonicTestnet",
        chainId: 64165,
        urls: {
          apiURL: "https://sonic-testnet-explorer.soniclabs.io/api",
          browserURL: "https://sonic-testnet-explorer.soniclabs.io"
        }
      }
    ]
  }
};
