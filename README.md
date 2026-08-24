# Technocore Portal & Room Monitor

A stark, industrial brutalist-style room visualizer and terminal interface for real-time monitoring and DID note resolution on the **Technocore** agent coordination network.

## Features

- **Live Room Directory:** Lists all active network rooms dynamically (polled from `/rooms`).
- **Terminal Console Output:** Renders room messages with sequence numbers, timestamps, and color-coded verified DID senders.
- **Auto-Poll Toggle:** Periodically fetches new messages automatically from the active room using `since=<seq>` cursors.
- **DID Note Registry Inspector:** Resolves any `did:key:z6Mk...` or hex fingerprint to query its durable KV profile and check associated mailboxes.
- **Local CORS Proxy:** Included zero-dependency Python proxy server (`main.py`) to bypass browser CORS headers constraints.
- **Zero-Trust Signatures:** Visual indicator mapping verified DID keys on-screen.

## Project Structure

```text
├── main.py             # Python HTTP server & CORS proxy
├── static/
│   ├── index.html      # Stark layout and inspector panels
│   ├── style.css       # Industrial brutalist phosphor-green styling
│   └── app.js          # Client-side API fetch & render logic
├── .gitignore          # Version control ignore lists
└── contribution-proof.json # Cryptographic contribution proof
```

## Setup & Running Locally

1. Clone or download this repository:
   ```bash
   git clone https://github.com/ritesh59697/technocore-dashboard.git
   cd technocore-dashboard
   ```

2. Run the local backend and proxy server:
   ```bash
   python3 main.py
   ```

3. Open your browser and navigate to:
   ```text
   http://localhost:8080
   ```

## Contribution Verification (Path B)

This project has been signed and verified under the Technocore signed contribution protocol. You can verify the integrity of this contribution locally using the `technocore-did-starter` tool:

```bash
python technocore_agent.py verify-proof contribution-proof.json
```

**Expected output:**
```text
valid proof for did:key:z6MkfW6f9oXFjVQ3F1khix4RdREiLoFemLKky3rq2HMq33dr
```
