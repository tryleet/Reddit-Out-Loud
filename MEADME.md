
# 🔊 Reddit Out Loud

A Chrome Extension that transforms any Reddit comment thread into a continuous, multi-voice audio conversation. Read comments aloud, filter out noise, and control the flow of discussion with smart thread expansion strategies.

**Status:** **V1 Complete and Production Ready** ✅

## ✨ Core Features

* **Intelligent Thread Reading:** Converts the nested visual comment structure into a smooth, linear audio conversation flow.
* **Multi-Voice Playback:** Cycles through a variety of selected English voices (across regions like US, UK, AU, etc.) so that each comment is read by a different "person" for a natural conversation feel.
* **Smart Expansion Strategies:** Prevents overwhelming loads by offering configurable strategies (Breadth-First, Depth-First, Balanced) and limits (max depth, max comments).
* **Active Highlighting & Scrolling:** The currently-speaking comment is precisely highlighted with a glowing indicator and smoothly scrolled into the center of the viewport.
* **Noise Filtering:** Automatically filters out comments from **AutoModerator, bot accounts, and moderator accounts** for cleaner audio. Removes all URLs/links from text to prevent disruptions.
* **Persistent & Background Playback:** Playback continues even if you close the extension popup or switch to another browser tab.
* **Full Customization:** First-time setup wizard and persistent settings for voice selection, speed, and expansion limits using secure `chrome.storage.sync`.

## 🛠️ Installation & Usage

### 1. Installation

Depth on Reddit is available on the Chrome Web Store.

**[TBC]**


### 2. Development & Testing (Local Setup)

To run the latest source code locally:

1. **Clone the repository:**
```bash
git clone https://github.com/tryleet/Reddit-Out-Loud.git
cd Reddit-Out-Loud

```


2. **Install dependencies:**
```bash
npm install

```


3. **Build the extension (in watch mode):**
```bash
npm run dev
# This creates the 'dist/' folder.

```


4. **Load in Chrome:**
* Open Chrome and navigate to `chrome://extensions/`.
* Enable **Developer mode** (top right).
* Click **Load unpacked**.
* Select the generated **`dist/`** folder.



### 3. Usage

1. Navigate to any Reddit post with comments (e.g., `https://www.reddit.com/r/AskReddit/comments/...`).
2. Click the **Depth on Reddit** icon in your browser toolbar.
3. The **Setup Wizard** will launch (first-time only). Configure your limits and voices.
4. Click **"Start Listening"** to begin extraction and playback.

---

## 🏗️ Technical Architecture

This project is built using modern browser extension standards and technologies.

| Technology | Purpose |
| --- | --- |
| **Manifest V3** | Chrome Extension standard. |
| **TypeScript** | Type safety and reliable code structure. |
| **React** | Interactive and responsive Popup UI (`popup.tsx`). |
| **Web Speech API** | Browser-native Text-to-Speech engine (`content.ts`). **Zero external API calls.** |
| **Webpack** | Bundling and compilation. |

### Component Responsibility

| File/Component | Primary Responsibilities |
| --- | --- |
| `src/content/content.ts` | **Extraction, Filtering, TTS Playback, Highlighting, Scrolling.** Contains the main business logic that runs on the Reddit page. |
| `src/popup/popup.tsx` | **UI, Controls, Settings Persistence.** Renders the React interface for controls and the setup wizard. |
| `src/background/background.ts` | **Lifecycle Management.** Monitors tab closing, navigation changes, and dispatches cleanup messages. |
| `src/utils/flattenComments.ts` | Utility to ensure the reading order follows the visual nesting hierarchy. |

## 🔒 Privacy Policy

**Depth on Reddit is completely private.**

* **No Network Requests:** The extension performs no network requests outside of Reddit to gather comment content.
* **No Tracking:** We do not collect, monitor, track, or transmit any user data, browsing history, or personal information.
* **Local Processing:** All comment extraction, filtering, and TTS generation occurs locally in your browser.
* **Local Storage:** User settings are saved securely using the `chrome.storage.sync` API, which is private to your Google account and is not accessed by the developers.

## 🤝 Contribution

We welcome contributions! If you find a bug, have a feature request, or want to contribute code:

1. Check the [Issues](https://www.google.com/search?q=link-to-issues-page) page to see if your issue has been reported.
2. Fork the repository and create a new branch.
3. Submit a Pull Request with a clear description of the change and the associated acceptance criteria.

---

*Created by Tryleet*