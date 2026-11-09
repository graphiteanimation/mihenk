Unicode true
!include "MUI2.nsh"
!define APP "AtolyeCAD"
!ifndef VERSION
!define VERSION "0.1.0"
!endif
Name "${APP} ${VERSION}"
OutFile "..\release\AtolyeCAD-Kurulum-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "Software\${APP}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP}.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Turkish"
Section "Program"
  SetOutPath "$INSTDIR"
  File /r "..\release\win-unpacked\*.*"
  WriteRegStr HKCU "Software\${APP}" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Kaldir.exe"
  CreateShortCut "$DESKTOP\${APP}.lnk" "$INSTDIR\${APP}.exe"
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortCut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\${APP}.exe"
  CreateShortCut "$SMPROGRAMS\${APP}\${APP} Kaldir.lnk" "$INSTDIR\Kaldir.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "DisplayName" "${APP}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "UninstallString" "$\"$INSTDIR\Kaldir.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "DisplayIcon" "$INSTDIR\${APP}.exe"
  WriteRegStr HKCU "Software\Classes\.acad" "" "AtolyeCAD.Belge"
  WriteRegStr HKCU "Software\Classes\AtolyeCAD.Belge\shell\open\command" "" "$\"$INSTDIR\${APP}.exe$\" $\"%1$\""
SectionEnd
Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APP}.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}"
  DeleteRegKey HKCU "Software\${APP}"
  DeleteRegKey HKCU "Software\Classes\AtolyeCAD.Belge"
SectionEnd
