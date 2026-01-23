# Installing Tempo Time Tracking Extension in Cursor

Since the Tempo Time Tracking extension isn't available directly in Cursor's marketplace, you need to install it manually from the VS Code Marketplace.

## Method 1: Install via UI (Recommended)

### Step 1: Download the Extension
1. Visit the VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=Tempo.tempotimetracking
2. On the right side of the page, click **"Download Extension"** 
3. This will download a `.vsix` file to your Downloads folder

**Alternative direct download:**
- Right-click and save this link: https://Tempo.gallerycdn.vsassets.io/extensions/tempo/tempotimetracking/3.0.0/1747142133751/Microsoft.VisualStudio.Services.VSIXPackage
- Save it as `tempo-time-tracking.vsix`

### Step 2: Install in Cursor
1. Open Cursor
2. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux) to open the Command Palette
3. Type **"Install from VSIX..."** and select it
4. Navigate to your Downloads folder and select the `tempo-time-tracking.vsix` file
5. Click **Install**

### Step 3: Reload Cursor
1. Press `Cmd+Shift+P` (or `Ctrl+Shift+P`)
2. Type **"Reload Window"** and press Enter

### Step 4: Authenticate with Tempo
1. After reload, you should see a notification: **"Tempo Time Tracking: Authorize now"**
2. Click **"Authorize now"**
3. Click **"Open"** to go to the Atlassian authorization page
4. Select your Jira site from the dropdown
5. Click **"Accept"** to authorize
6. Return to Cursor to complete the setup

### Step 5: Track Your Repository
1. When you open a workspace with a git repository, you'll be prompted to track it
2. Click **"Track"** to enable time tracking for that repository
3. The Tempo status indicator will appear in Cursor's bottom status bar

---

## Method 2: Install via Command Line

### Step 1: Download the Extension
```bash
cd ~/Downloads
curl -L "https://Tempo.gallerycdn.vsassets.io/extensions/tempo/tempotimetracking/3.0.0/1747142133751/Microsoft.VisualStudio.Services.VSIXPackage" -o tempo-time-tracking.vsix --header "User-Agent: Mozilla/5.0"
```

### Step 2: Install in Cursor
```bash
cursor --install-extension ~/Downloads/tempo-time-tracking.vsix
```

### Step 3: Reload Cursor
- Press `Cmd+Shift+P` (or `Ctrl+Shift+P`)
- Type **"Reload Window"** and press Enter

### Step 4: Authenticate with Tempo
Follow steps 4-5 from Method 1 above.

---

## Verification

After installation, you should see:
- A **Tempo status indicator** in Cursor's bottom status bar showing:
  - `Tempo: Tracking repository` - when actively tracking
  - `Tempo: Last event sent <time>` - shows last sync time
  - `Tempo: Not tracking repository` - if tracking is disabled

## Available Commands

Access these via `Cmd+Shift+P` (or `Ctrl+Shift+P`):
- **Tempo: Toggle debug** - Enable/disable debug logging
- **Tempo: Track current repository** - Start tracking the current repo
- **Tempo: Don't track current repository** - Stop tracking the current repo
- **Tempo: Open My Work** - Open Tempo's My Work page
- **Tempo: Reset** - Reset all extension settings

## Requirements

- Cursor version 1.46 or higher
- Jira Cloud account with Tempo Timesheets enabled
- Git repository (for tracking code changes)

## Troubleshooting

**Extension not found in marketplace:**
- This is expected - Cursor's marketplace doesn't include all VS Code extensions
- Use the manual installation method above

**Authorization issues:**
- Make sure you're logged into Jira Cloud
- Try the "Tempo: Reset" command and re-authenticate

**Not tracking:**
- Check that you've selected "Track" when prompted for your repository
- Verify the status indicator in the bottom bar
- Use "Tempo: Track current repository" command if needed

## Notes

- The extension tracks file saves and git commits/checkouts
- For best results, include Jira issue keys in your branch names or commit messages
- Time tracking data is sent to Tempo's API for suggestions in Tempo Timesheets
