<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/windows8/windows8-original.svg" width="22" height="22" alt="Windows">&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/apple/apple-original.svg" width="22" height="22" alt="macOS">&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/linux/linux-original.svg" width="22" height="22" alt="Linux">&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/ios/9ca3af" width="22" height="22" alt="iOS">&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/android/android-original.svg" width="22" height="22" alt="Android">
</p>

<h1 align="center">
  <img src="github/readme/emoj2i.gif" width="48" height="48" align="absmiddle" alt="emoji">&nbsp;Raser
</h1>

<p align="center">
  <b>A free, open-source desktop music player for YouTube Music, SoundCloud, and local files.</b><br>
  Built with Material Design 3, no tracking, and open to community contributions.
</p>

<p align="center">
  <a href="https://github.com/darkness-38/Raser/releases">
    <img src="https://img.shields.io/badge/Download-6750A4?style=for-the-badge&logo=download&logoColor=white" height="40" alt="Download">
  </a>
</p>

<p align="center">
  <a href="#features">Features</a> &nbsp;·&nbsp;
  <a href="#download-and-install">Install</a> &nbsp;·&nbsp;
  <a href="#build-from-source">Build</a> &nbsp;·&nbsp;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <a href="https://github.com/darkness-38/Raser/stargazers"><img src="https://img.shields.io/github/stars/darkness-38/Raser?style=flat-square&labelColor=16191C&color=CAD3F5" alt="Stars"></a>
  <a href="https://github.com/darkness-38/Raser/commits/main"><img src="https://img.shields.io/github/last-commit/darkness-38/Raser?style=flat-square&labelColor=16191C&color=94C9FF" alt="Last Commit"></a>
  <a href="https://github.com/darkness-38/Raser/blob/main/LICENSE"><img src="https://img.shields.io/github/license/darkness-38/Raser?style=flat-square&labelColor=16191C&color=8EEDD8" alt="License"></a>
</p>

## What is Raser?

Raser is an open-source, telemetry-free desktop music player and audio suite for **Windows, Linux, and macOS**. It unifies playback across **YouTube Music**, **YouTube**, **SoundCloud**, and offline local media into a single high-performance interface without ads, subscriptions, or login constraints.

> **Note on Project Origins:**  
> This project was created because the original Riff project no longer accepts pull requests or external contributions. Raser continues development as an independent project, incorporating essential bug fixes, stability improvements, audio enhancements, and custom features.

Built with **Electron**, **Vanilla JavaScript**, and **WebGL**, Raser provides responsive UI interactions and hardware-accelerated audio visualization without runtime framework overhead. The project is distributed under the **MIT license** and enforces strict privacy: all configuration, cached streams, and playback history remain strictly on the local machine.

## Features

- High quality streaming with **YouTube Music, YouTube, and SoundCloud** without third-party advertisements or account requirements
- **Offline lossless playback with full local library support** for high resolution formats including FLAC, WAV, MP3, OGG, and M4A
- **Album Downloads:** Full album download with automated track numbering and organized album subfolders
- **Fluid Drag & Drop Reordering:** Smooth manual track reordering in playlists and favorites with virtual scroll support
- **Lossless audio trimmer:** Integrated visual waveform editor to cut, export, and splice local audio
- **10-band parametric equalizer:** Tuned frequency filters and audio DSP presets
- **Discord Rich Presence:** Real-time track status with album art and playback controls
- **Dynamic Themes:** Material You (M3) expressive layout with dynamic color extraction from album covers

## Download and Install

Pre-built binaries are available on the [Releases page](https://github.com/darkness-38/Raser/releases).

### Linux
Run the AppImage directly:
```bash
chmod +x Raser-*.AppImage
./Raser-*.AppImage
```

## Build from Source

### Prerequisites
- Node.js 18+
- npm or yarn

```bash
git clone https://github.com/darkness-38/Raser.git
cd Raser
npm install
npm start
```

## Contributing

Pull requests and community contributions are very welcome! Feel free to report issues, suggest features, or submit pull requests.

## License

[MIT](LICENSE)
