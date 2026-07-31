// Bootstrapper (NSIS) to install the correct binary for Windows 7/10 (32‑bit & 64‑bit)
; ---------------------------------------------------------------
; This script expects the following installer files to be placed in the same directory:
;   SalesTrack-Pro-Setup-1.10.7-win7-ia32.exe   ; Electron 22, 32‑bit (Windows 7)
;   SalesTrack-Pro-Setup-1.10.7-win7-x64.exe    ; Electron 22, 64‑bit (Windows 7 and also works on Win10 32‑bit)
;   SalesTrack-Pro-Setup-1.10.7-win10-ia32.exe  ; Electron 31, 32‑bit (Windows 10+)
;   SalesTrack-Pro-Setup-1.10.7-win10-x64.exe   ; Electron 31, 64‑bit (Windows 10+)
;
; Build this bootstrapper with NSIS (makensis). The generated .exe will automatically
; detect the OS version and CPU architecture and launch the appropriate installer.
; ---------------------------------------------------------------

!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WinVer.nsh"

OutFile "SalesTrack-Pro-Setup-1.10.7.exe"
RequestExecutionLevel user

Function .onInit
  ; Detect OS major version (7 = 6.1, 8 = 6.2/6.3, 10 = 10.0)
  ${GetWindowsVersion} $0 $1 $2 $3
  ; $0 = major, $1 = minor
  ; Detect CPU architecture
  ${If} ${RunningX64}
    StrCpy $4 "x64"
  ${Else}
    StrCpy $4 "ia32"
  ${EndIf}

  ; Choose installer based on OS version and arch
  ${If} $0 < 10 ; Windows 7 or 8
    StrCpy $5 "win7"
  ${Else}
    StrCpy $5 "win10"
  ${EndIf}

  ; Construct file name
  StrCpy $6 "SalesTrack-Pro-Setup-1.10.7-$5-$4.exe"
FunctionEnd

Section "Install"
  ; Run the selected installer silently (you can add /S flag if you want silent mode)
  ExecWait '"$EXEDIR\$6"'
SectionEnd
