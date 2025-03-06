# Intelligent Telemedicine Blockchain System

A decentralized telemedicine platform built on the Sonic Testnet, integrating AI symptom analysis, video calls, lab services, prescriptions, data monetization, and account abstraction (ERC-4337). This system leverages blockchain technology to ensure secure, transparent, and incentivized healthcare interactions.

## Features
- **AI Symptom Analysis**: Patients can submit symptoms for AI-driven analysis, reviewed by doctors.
- **Video Calls**: Secure, scheduled video consultations between patients and doctors.
- **Lab Services**: Order, collect, and review lab tests with IPFS storage for results.
- **Prescriptions**: Generate, verify, and fulfill prescriptions with QR code support.
- **Data Monetization**: Patients can opt-in to share anonymized data and earn SONIC tokens.
- **Account Abstraction**: Gasless transactions via ERC-4337 entry point for seamless user experience.
- **Gamification**: Earn MediPoints for engaging with the system.

## Repository Structure
- **`contracts/`**: Smart contract files (Solidity) and Hardhat configuration.
- **`backend/`**: Node.js backend with Express, WebSocket, and IPFS integration.
- **`frontend/`**: React frontend with Tailwind CSS for user interface.

## Prerequisites
- Node.js (>= 16.x)
- Hardhat (for smart contract development)
- Sonic Testnet RPC endpoint
- IPFS node (e.g., Infura)
- MetaMask or compatible wallet

## Setup Instructions

### Smart Contract
1. Navigate to `contracts/`:
   ```bash
   cd contracts
