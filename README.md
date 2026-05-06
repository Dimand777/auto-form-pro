# Auto-Form Pro

**Professional Web Form Automation Tool for Chrome**

**Developer:** Dmitri Smoljannikov

---

## Description

**Auto-Form Pro** is a powerful, production-ready Chrome Extension (Manifest V3) designed for automating web form interactions. Whether you're testing applications, filling repetitive forms, or creating automated workflows, Auto-Form Pro provides a seamless **Record & Playback** experience without writing a single line of code.

**Keywords:** Form Automation, Recorder, Playback, No-code, Dmitri Smoljannikov, Chrome Extension, Web Automation, Form Filler, Browser Automation, Testing Tool

---

## Key Features

- **Intuitive Recording**: Capture your interactions (clicks, inputs, changes) with a single click
- **Smart Playback**: Replay recorded scenarios with automatic navigation and intelligent element detection
- **React & Vue Compatible**: Uses modern event dispatching for compatibility with JavaScript frameworks
- **Smart Wait Technology**: 10-second timeout with intelligent polling for dynamic elements
- **Scenario Management**: Save, rename, delete, and organize multiple automation scenarios
- **JSON Import/Export**: Share and backup your automation scripts easily
- **Persistent State**: Handles page reloads and redirects seamlessly during playback
- **Professional UI**: Clean, branded interface with execution logging

---

## How to Install (Unpacked)

1. **Download or clone** this repository to your local machine

2. **Open Chrome** and navigate to `chrome://extensions/`

3. **Enable "Developer mode"** using the toggle in the top-right corner

4. **Click "Load unpacked"** button

5. **Select the project folder** (`auto-form-pro`) containing the extension files

6. The Auto-Form Pro icon should now appear in your Chrome toolbar

---

## How to Use

### Recording a Scenario

1. Navigate to the web page containing the form you want to automate
2. Click the Auto-Form Pro extension icon
3. Click the **Record** button (red circle)
4. Interact with the form elements (click, type, select options)
5. Click **Stop** when finished
6. Enter a name for your scenario when prompted

### Playing a Scenario

1. Open the Auto-Form Pro popup
2. Select a saved scenario from the list
3. Click the **Play** button (blue play icon)
4. The extension will automatically navigate to the starting URL and replay all actions

### Managing Scenarios

- **Rename**: Click the "Rename" button next to any scenario
- **Delete**: Click the "Delete" button to remove a scenario
- **Export**: Click "Export JSON" to download all scenarios as a file
- **Import**: Click "Import JSON" to load scenarios from a file

### Execution Log

The built-in execution log displays real-time status updates, recording progress, and playback results for easy debugging.

---

## File Structure

```
auto-form-pro/
├── manifest.json      # Extension configuration (Manifest V3)
├── background.js      # Service worker for state management
├── content.js         # Content script for recording & playback
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic and scenario management
├── .gitignore         # Git ignore rules
└── README.md          # Documentation
```

---

## Technical Details

- **Manifest Version**: 3
- **Permissions**: `storage`, `tabs`, `scripting`, `activeTab`, `downloads`
- **Playback Delay**: Fixed 500ms between steps
- **Smart Wait Timeout**: 10 seconds for element detection
- **Framework Compatibility**: React, Vue, Angular, and vanilla JavaScript

---

## License

**MIT License for Dmitri Smoljannikov**

Copyright (c) 2024 Dmitri Smoljannikov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Support

For issues, feature requests, or contributions, please contact the developer **Dmitri Smoljannikov**.

---

*Developed with expertise and professionalism by Dmitri Smoljannikov*
