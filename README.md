# AFES Brand Factory Overleaf Helper

A lightweight Chrome Extension that helps you **copy** or **download**
compiled assets (PDF, SVG, PNG) from an AFES Brand Factory Overleaf project
with a single click. It detects the latest Overleaf build in the active tab
and either copies the asset to your clipboard or downloads it directly.

The extension also provides an interface for creating a new AFES Brand Factory
Overleaf project from the latest version of the LaTeX `afesbrand` package and
indicates when a new `afesbrand` package version is available.

## Installation (developer mode)

1. **Clone** or download this repository.  
2. Open **Chrome** → `chrome://extensions/` → toggle **Developer mode**.  
3. Click **Load unpacked** and select the project folder.  
4. Open an AFES Brand Factory Overleaf project, compile, then click the
   extension icon.

## Acknowledgements

Icons by [Phosphor Icons](https://phosphoricons.com) (MIT licence).

Developed with assistance from [Claude](https://claude.ai) (Anthropic),
[Copilot](https://copilot.microsoft.com) (Microsoft) and
[ChatGPT](https://chatgpt.com) (OpenAI).

## Privacy Policy

AFES Brand Factory Overleaf Helper does not collect, transmit, or share any
personal data.

The extension injects a script solely to intercept Overleaf's internal compile
response to extract a build ID from the response URL. No request data,
response bodies, or user data are read or transmitted. The interceptor
operates only on `overleaf.com/project/*` pages.

The extension stores three values locally on your device using Chrome's
`storage.local` API: the most recently used Overleaf project ID, its
associated tab ID, and your "Save As" download preference. This data never
leaves your device and is not accessible to any third party.

When the extension popup is opened, it makes a single request to the GitHub
API (`api.github.com`) to check for the latest release version of the
`afesbrand` LaTeX package. No identifying information is sent with this
request.

All other network requests are made directly to
[overleaf.com](https://www.overleaf.com) on your behalf, using your existing
browser session, solely to retrieve compiled output files from your own
project.

## Licence

```
Copyright (c) 2026 David Purton <david.purton@afes.org.au>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
```
