2026-05-18T06:05:45.6099300Z Current runner version: '2.334.0'
2026-05-18T06:05:45.6113160Z ##[group]Runner Image Provisioner
2026-05-18T06:05:45.6113870Z Hosted Compute Agent
2026-05-18T06:05:45.6114550Z Version: 20260422.526
2026-05-18T06:05:45.6114970Z Commit: e1a9e573f4d0838b3a7c1b07401aeb29ed3635a9
2026-05-18T06:05:45.6115420Z Build Date: 2026-04-22T09:31:31Z
2026-05-18T06:05:45.6115850Z Worker ID: {c334d52f-a9a7-4512-8d48-191ccf10f732}
2026-05-18T06:05:45.6116270Z Azure Region: westus
2026-05-18T06:05:45.6116590Z ##[endgroup]
2026-05-18T06:05:45.6117700Z ##[group]Operating System
2026-05-18T06:05:45.6118040Z macOS
2026-05-18T06:05:45.6118320Z 15.7.4
2026-05-18T06:05:45.6118590Z 24G517
2026-05-18T06:05:45.6118870Z ##[endgroup]
2026-05-18T06:05:45.6119170Z ##[group]Runner Image
2026-05-18T06:05:45.6119500Z Image: macos-15-arm64
2026-05-18T06:05:45.6119820Z Version: 20260427.0018.1
2026-05-18T06:05:45.6120570Z Included Software: https://github.com/actions/runner-images/blob/macos-15-arm64/20260427.0018/images/macos/macos-15-arm64-Readme.md
2026-05-18T06:05:45.6121520Z Image Release: https://github.com/actions/runner-images/releases/tag/macos-15-arm64%2F20260427.0018
2026-05-18T06:05:45.6122110Z ##[endgroup]
2026-05-18T06:05:45.6122750Z ##[group]GITHUB_TOKEN Permissions
2026-05-18T06:05:45.6123860Z Contents: write
2026-05-18T06:05:45.6124200Z Metadata: read
2026-05-18T06:05:45.6124510Z ##[endgroup]
2026-05-18T06:05:45.6125910Z Secret source: Actions
2026-05-18T06:05:45.6126330Z Prepare workflow directory
2026-05-18T06:05:45.6347840Z Prepare all required actions
2026-05-18T06:05:45.6375410Z Getting action download info
2026-05-18T06:05:46.0915630Z Download action repository 'actions/checkout@v4' (SHA:34e114876b0b11c390a56381ad16ebd13914f8d5)
2026-05-18T06:05:46.5365070Z Download action repository 'pnpm/action-setup@v6' (SHA:0e279bb959325dab635dd2c09392533439d90093)
2026-05-18T06:05:47.2488770Z Download action repository 'actions/setup-node@v4' (SHA:49933ea5288caeca8642d1e84afbd3f7d6820020)
2026-05-18T06:05:47.3670390Z Download action repository 'dtolnay/rust-toolchain@stable' (SHA:29eef336d9b2848a0b548edc03f92a220660cdb8)
2026-05-18T06:05:47.8002400Z Download action repository 'swatinem/rust-cache@v2' (SHA:e18b497796c12c097a38f9edb9d0641fb99eee32)
2026-05-18T06:05:48.6921370Z Download action repository 'tauri-apps/tauri-action@v0' (SHA:84b9d35b5fc46c1e45415bdb6144030364f7ebc5)
2026-05-18T06:05:49.6639450Z Complete job name: publish-tauri (macos-latest, --target universal-apple-darwin)
2026-05-18T06:05:49.7065170Z ##[group]Run actions/checkout@v4
2026-05-18T06:05:49.7065700Z with:
2026-05-18T06:05:49.7065850Z   repository: Snenjih/Nexum
2026-05-18T06:05:49.7066230Z   token: ***
2026-05-18T06:05:49.7066360Z   ssh-strict: true
2026-05-18T06:05:49.7066500Z   ssh-user: git
2026-05-18T06:05:49.7066630Z   persist-credentials: true
2026-05-18T06:05:49.7066790Z   clean: true
2026-05-18T06:05:49.7066940Z   sparse-checkout-cone-mode: true
2026-05-18T06:05:49.7067120Z   fetch-depth: 1
2026-05-18T06:05:49.7067250Z   fetch-tags: false
2026-05-18T06:05:49.7067470Z   show-progress: true
2026-05-18T06:05:49.7067620Z   lfs: false
2026-05-18T06:05:49.7067750Z   submodules: false
2026-05-18T06:05:49.7067900Z   set-safe-directory: true
2026-05-18T06:05:49.7068170Z ##[endgroup]
2026-05-18T06:05:50.2503050Z Syncing repository: Snenjih/Nexum
2026-05-18T06:05:50.2506750Z ##[group]Getting Git version info
2026-05-18T06:05:50.2509200Z Working directory is '/Users/runner/work/Nexum/Nexum'
2026-05-18T06:05:50.2513360Z [command]/opt/homebrew/bin/git version
2026-05-18T06:05:50.3496380Z git version 2.54.0
2026-05-18T06:05:50.3552120Z ##[endgroup]
2026-05-18T06:05:50.3563930Z Copying '/Users/runner/.gitconfig' to '/Users/runner/work/_temp/a450e31f-718f-43e3-af7c-2c84e22d7fb9/.gitconfig'
2026-05-18T06:05:50.3583550Z Temporarily overriding HOME='/Users/runner/work/_temp/a450e31f-718f-43e3-af7c-2c84e22d7fb9' before making global git config changes
2026-05-18T06:05:50.3584850Z Adding repository directory to the temporary git global config as a safe directory
2026-05-18T06:05:50.3596520Z [command]/opt/homebrew/bin/git config --global --add safe.directory /Users/runner/work/Nexum/Nexum
2026-05-18T06:05:50.3819740Z Deleting the contents of '/Users/runner/work/Nexum/Nexum'
2026-05-18T06:05:50.3824810Z ##[group]Initializing the repository
2026-05-18T06:05:50.3829760Z [command]/opt/homebrew/bin/git init /Users/runner/work/Nexum/Nexum
2026-05-18T06:05:50.4118220Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-05-18T06:05:50.4120610Z hint: will change to "main" in Git 3.0. To configure the initial branch name
2026-05-18T06:05:50.4121170Z hint: to use in all of your new repositories, which will suppress this warning,
2026-05-18T06:05:50.4121600Z hint: call:
2026-05-18T06:05:50.4121830Z hint:
2026-05-18T06:05:50.4122220Z hint: 	git config --global init.defaultBranch <name>
2026-05-18T06:05:50.4122570Z hint:
2026-05-18T06:05:50.4122910Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
2026-05-18T06:05:50.4123400Z hint: 'development'. The just-created branch can be renamed via this command:
2026-05-18T06:05:50.4123810Z hint:
2026-05-18T06:05:50.4124050Z hint: 	git branch -m <name>
2026-05-18T06:05:50.4124340Z hint:
2026-05-18T06:05:50.4124690Z hint: Disable this message with "git config set advice.defaultBranchName false"
2026-05-18T06:05:50.4125770Z Initialized empty Git repository in /Users/runner/work/Nexum/Nexum/.git/
2026-05-18T06:05:50.4127490Z [command]/opt/homebrew/bin/git remote add origin https://github.com/Snenjih/Nexum
2026-05-18T06:05:50.4220300Z ##[endgroup]
2026-05-18T06:05:50.4220640Z ##[group]Disabling automatic garbage collection
2026-05-18T06:05:50.4224000Z [command]/opt/homebrew/bin/git config --local gc.auto 0
2026-05-18T06:05:50.4304880Z ##[endgroup]
2026-05-18T06:05:50.4305180Z ##[group]Setting up auth
2026-05-18T06:05:50.4310800Z [command]/opt/homebrew/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-05-18T06:05:50.4390450Z [command]/opt/homebrew/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-05-18T06:05:50.5545150Z [command]/opt/homebrew/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-05-18T06:05:50.5611270Z [command]/opt/homebrew/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-05-18T06:05:50.6551140Z [command]/opt/homebrew/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-05-18T06:05:50.6762140Z [command]/opt/homebrew/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-05-18T06:05:50.7456420Z [command]/opt/homebrew/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
2026-05-18T06:05:50.7540230Z ##[endgroup]
2026-05-18T06:05:50.7540670Z ##[group]Fetching the repository
2026-05-18T06:05:50.7546330Z [command]/opt/homebrew/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +f4e450c76fe7d8daba412a2e7e8bb4018f119436:refs/remotes/origin/main
2026-05-18T06:05:52.0624890Z From https://github.com/Snenjih/Nexum
2026-05-18T06:05:52.0625400Z  * [new ref]         f4e450c76fe7d8daba412a2e7e8bb4018f119436 -> origin/main
2026-05-18T06:05:52.0703140Z ##[endgroup]
2026-05-18T06:05:52.0703660Z ##[group]Determining the checkout info
2026-05-18T06:05:52.0704170Z ##[endgroup]
2026-05-18T06:05:52.0706690Z [command]/opt/homebrew/bin/git sparse-checkout disable
2026-05-18T06:05:52.0858630Z [command]/opt/homebrew/bin/git config --local --unset-all extensions.worktreeConfig
2026-05-18T06:05:52.0965800Z ##[group]Checking out the ref
2026-05-18T06:05:52.0973860Z [command]/opt/homebrew/bin/git checkout --progress --force -B main refs/remotes/origin/main
2026-05-18T06:05:52.3055180Z Switched to a new branch 'main'
2026-05-18T06:05:52.3071250Z branch 'main' set up to track 'origin/main'.
2026-05-18T06:05:52.3082540Z ##[endgroup]
2026-05-18T06:05:52.3180020Z [command]/opt/homebrew/bin/git log -1 --format=%H
2026-05-18T06:05:52.3252210Z f4e450c76fe7d8daba412a2e7e8bb4018f119436
2026-05-18T06:05:52.3596860Z ##[group]Run rustup target add aarch64-apple-darwin
2026-05-18T06:05:52.3597290Z 
