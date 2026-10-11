# ClipFetch — Video Downloader Starter

A mobile-friendly Node.js/Express starter website. The working downloader currently supports **direct, publicly accessible video-file URLs** ending in `.mp4`, `.webm`, `.mov`, `.m4v`, `.ogv`, or `.mkv`. It does not scrape or bypass platform protections.

## Requirements
- Node.js 20 or newer
- Network access from the server to the direct video file

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000

## Current functionality
- Responsive mobile-first interface
- Direct video URL inspection
- Download streaming through the backend
- Basic URL validation, private-network URL checks, content-type checks, and 1 GiB transfer cap
- Health endpoint at `/health`

## Important limitations
- The quality dropdown is currently a UI preference only. Direct links download the original file and are not converted to 1080p. A real quality selector requires source-specific metadata plus a transcoding or authorized stream-merging pipeline.
- A URL ending in a video extension is not proof that the user has rights to download it. Use only content you own, have permission to download, or that the source explicitly makes available for download.
- This starter intentionally does not download from YouTube, Facebook, Instagram, private pages, login-gated sources, or DRM-protected streams. For additional platforms, implement official APIs or platform-specific adapters only where the platform terms, rights holder, and applicable law permit downloading.
- Production hardening is required before public deployment: add rate limits, per-user quotas, job cleanup, logging with privacy safeguards, stricter egress/network controls, request timeouts, malware/content scanning as appropriate, and abuse reporting. The basic URL checks here are not a substitute for a robust SSRF/egress policy.

## Deployment
Deploy the project to a Node.js host that supports outbound HTTPS traffic. Set `PORT` if required by the host. Use HTTPS, keep dependencies updated, set resource and request limits, and monitor disk/bandwidth costs. If you later add FFmpeg, use a worker queue and temporary storage with automatic cleanup. Do not expose a public downloader without rate limits and abuse protections.

## Adding platform support
Create an adapter per platform with a clear capability contract: metadata lookup, permitted download URL resolution, supported resolutions, expiry handling, and rights/terms checks. Never bypass DRM, authentication, paywalls, or technical access controls. Only show 1080p when the source actually provides a 1080p rendition and the adapter is authorized to access it.
