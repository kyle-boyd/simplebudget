# Firebase Emulator Setup Instructions

## Prerequisites

Firebase emulators require Java to run. You need to install Java first.

### Install Java on macOS

**⚠️ Important: Firebase emulators require Java 21 or higher**

**Option 1: Using Homebrew (Recommended)**

1. Install Homebrew (if not already installed):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. Install Java 21:
   ```bash
   brew install openjdk@21
   ```

3. Link Java:
   ```bash
   sudo ln -sfn /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk
   ```

**Option 2: Download Java 21 directly**

1. Visit https://adoptium.net/
2. Download **Java 21** (LTS) for macOS
3. Install the downloaded package

Or use this direct download command:
```bash
curl -L -o /tmp/openjdk21.pkg "https://api.adoptium.net/v3/installer/latest/21/ga/mac/aarch64/jdk/hotspot/normal/eclipse?project=jdk"
open /tmp/openjdk21.pkg
```

**Option 3: Using SDKMAN (Alternative)**

```bash
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"
sdk install java 17.0.9-tem
```

### Verify Java Installation

After installing Java, verify it's working:
```bash
java -version
```

You should see output like:
```
openjdk version "21.0.x" ...
```

**Note:** Make sure you have Java 21 or higher. Firebase emulators no longer support Java versions below 21.

## Starting the Firebase Emulators

Once Java is installed, you can start the emulators:

```bash
npm run emulators:start
```

This will start:
- **Auth Emulator** at `http://localhost:9099`
- **Database Emulator** at `http://localhost:9000`
- **Emulator UI** at `http://localhost:4000`

## Testing locally: two options

### Option A: With emulators (recommended for offline / test data)

You need the Auth emulator running so the app can reach `localhost:9099`. Either:

**One command (emulators + dev server together):**
```bash
npm run dev:local
```

**Or two terminals:**
1. Terminal 1 – start emulators:
   ```bash
   npm run emulators:start
   ```
2. Terminal 2 – start the app:
   ```bash
   npm run dev
   ```

Requires **Java 21+** (see Prerequisites above). Emulator UI: http://localhost:4000 (create test users there if needed).

### Option B: Without emulators (use production Firebase)

To test against your real Firebase project (no Java, no emulator):

1. Create a file `.env.local` in the project root with:
   ```
   VITE_USE_FIREBASE_EMULATORS=false
   ```
2. Start the app:
   ```bash
   npm run dev
   ```

Login/signup will use your live Firebase Auth. Make sure your email is allowed in the Firebase Console if you use sign-in.

---

## Using the Emulators (when running)

1. Start the emulators in one terminal:
   ```bash
   npm run emulators:start
   ```

2. In another terminal, start your development server:
   ```bash
   npm run dev
   ```

3. Access the Emulator UI at `http://localhost:4000` to:
   - View and manage emulator data
   - Create test users
   - Inspect the database
   - View authentication state

## Troubleshooting

### Port Already in Use
If you get a port conflict error, you can:
- Stop any processes using ports 4000, 9000, or 9099
- Or modify the ports in `firebase.json`

### Java Not Found
Make sure Java is installed and in your PATH:
```bash
echo $JAVA_HOME
java -version
```

If Java is installed but not found, you may need to add it to your PATH in `~/.zshrc`:
```bash
export JAVA_HOME=$(/usr/libexec/java_home)
export PATH=$JAVA_HOME/bin:$PATH
```

