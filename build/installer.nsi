Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!define APP "Mihenk"
!define APPFULL "Mihenk CAD/CAM"
!ifndef VERSION
!define VERSION "0.2.0"
!endif
Name "${APPFULL} ${VERSION}"
BrandingText "${APPFULL}"
Icon "icon.ico"
UninstallIcon "icon.ico"
OutFile "..\release\Mihenk-Kurulum-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "Software\${APP}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
; Kurulum dili: Türkçe ya da English. Seçim kayıt defterinde saklanır; kaldırıcı aynı dili kullanır.
!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "Software\${APP}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "InstallerLanguage"
!insertmacro MUI_PAGE_WELCOME
; Seçilen dizinin sonuna otomatik "\Mihenk" eklenir (kaldırıcı kullanıcının klasörünü asla silmesin)
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP}.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Turkish"
!insertmacro MUI_LANGUAGE "English"
LangString SEC_PROGRAM ${LANG_TURKISH} "Program"
LangString SEC_PROGRAM ${LANG_ENGLISH} "Program"
; Kısayol adı dosya adıdır: "/" içeremez (APPFULL "CAD/CAM" içerir; kısayol hiç oluşmuyordu). O-051
LangString LNK_UNINSTALL ${LANG_TURKISH} "${APP} Kaldır"
LangString LNK_UNINSTALL ${LANG_ENGLISH} "Uninstall ${APP}"

; $INSTDIR "\Mihenk" ile bitmiyorsa ekler (sondaki "\" atılır)
Function EnsureSubdir
  StrCpy $0 $INSTDIR 1 -1
  ${If} $0 == "\"
    StrCpy $INSTDIR $INSTDIR -1
  ${EndIf}
  ; "\Mihenk" 7 karakter (eski kod 10 karakter karşılaştırıyordu → her kurulumda bir "\Mihenk" daha ekleniyordu)
  StrCpy $0 $INSTDIR 7 -7
  ${If} $0 != "\${APP}"
    StrCpy $INSTDIR "$INSTDIR\${APP}"
  ${EndIf}
FunctionEnd
; Klasör sayfasından çıkışta (elle yazılan yol dahil) çağrılır; kurulum bölümü de aynı işlevi yeniden çağırır (çift güvence)
Function DirLeave
  Call EnsureSubdir
FunctionEnd
Function .onInit
  !insertmacro MUI_LANGDLL_DISPLAY
  Call EnsureSubdir
FunctionEnd
Function un.onInit
  !insertmacro MUI_UNGETLANGUAGE
FunctionEnd

Section "$(SEC_PROGRAM)"
  ; DirLeave hiç çalışmasa da (sessiz kurulum /D=, elle yazılan yol) dosyalar Programs köküne açılmasın; işlev idempotent
  Call EnsureSubdir
  SetOutPath "$INSTDIR"
  File /r "..\release\win-unpacked\*.*"
  WriteRegStr HKCU "Software\${APP}" "InstallDir" "$INSTDIR"
  ; Örnek belgeler ve genel örnek tezgâh profilleri ($INSTDIR\resources\ornekler) salt okunur kaynaktır: kullanıcı kendi klasörüne "Farklı kaydet" yapar
  nsExec::Exec '"$SYSDIR\attrib.exe" +R "$INSTDIR\resources\ornekler\*" /S'
  Pop $0
  File "/oname=doc-icon.ico" "doc-icon.ico"
  WriteUninstaller "$INSTDIR\Kaldir.exe"
  ; Kurulum dili uygulamanın ilk açılış diline aktarılır: kurulum dizininde "lang" dosyası (tr | en)
  ${If} $LANGUAGE == ${LANG_TURKISH}
    StrCpy $0 "tr"
  ${Else}
    StrCpy $0 "en"
  ${EndIf}
  FileOpen $1 "$INSTDIR\lang" w
  FileWrite $1 $0
  FileClose $1
  WriteRegStr HKCU "Software\${APP}" "Lang" $0
  CreateShortCut "$DESKTOP\${APP}.lnk" "$INSTDIR\${APP}.exe"
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortCut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\${APP}.exe"
  ; eski sürümlerden kalan kaldırma kısayolları (O-051)
  Delete "$SMPROGRAMS\${APP}\Uninstall Mihenk CADCAM.lnk"
  Delete "$SMPROGRAMS\${APP}\Mihenk CADCAM Kald*r.lnk"
  CreateShortCut "$SMPROGRAMS\${APP}\$(LNK_UNINSTALL).lnk" "$INSTDIR\Kaldir.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "DisplayName" "${APPFULL}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "UninstallString" "$\"$INSTDIR\Kaldir.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}" "DisplayIcon" "$INSTDIR\${APP}.exe"
  ; .mhnk ilişkilendirmesi: mevcut başka bir ilişkilendirme yedeklenir, kaldırmada geri yüklenir
  ReadRegStr $2 HKCU "Software\Classes\.mhnk" ""
  ${If} $2 != ""
  ${AndIf} $2 != "Mihenk.Belge"
    WriteRegStr HKCU "Software\${APP}" "PrevDocAssoc" $2
  ${EndIf}
  WriteRegStr HKCU "Software\Classes\.mhnk" "" "Mihenk.Belge"
  WriteRegStr HKCU "Software\Classes\Mihenk.Belge" "" "Mihenk belgesi / document"
  WriteRegStr HKCU "Software\Classes\Mihenk.Belge\DefaultIcon" "" "$INSTDIR\doc-icon.ico"
  WriteRegStr HKCU "Software\Classes\Mihenk.Belge\shell\open\command" "" "$\"$INSTDIR\${APP}.exe$\" $\"%1$\""
SectionEnd

; Kaldırıcı YALNIZ kurulumun yazdığı dosyaları siler (liste scripts/gen-uninstall-list.mjs ile üretilir).
; "RMDir /r" yok: kurulum klasörü boş değilse (kullanıcı dosyası varsa) klasör silinmez.
Section "Uninstall"
  ; örnekler salt okunur kurulur: silmeden önce özellik kaldırılır
  nsExec::Exec '"$SYSDIR\attrib.exe" -R "$INSTDIR\resources\ornekler\*" /S'
  Pop $0
  !include "..\release\uninstall-files.nsh"
  Delete "$INSTDIR\lang"
  Delete "$INSTDIR\doc-icon.ico"
  Delete "$INSTDIR\Kaldir.exe"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\${APP}.lnk"
  Delete "$SMPROGRAMS\${APP}\${APP}.lnk"
  Delete "$SMPROGRAMS\${APP}\$(LNK_UNINSTALL).lnk"
  ; eski sürümlerden kalan kaldırma kısayolları (O-051)
  Delete "$SMPROGRAMS\${APP}\Uninstall Mihenk CADCAM.lnk"
  Delete "$SMPROGRAMS\${APP}\Mihenk CADCAM Kald*r.lnk"
  RMDir "$SMPROGRAMS\${APP}"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}"
  ReadRegStr $2 HKCU "Software\Classes\.mhnk" ""
  ${If} $2 == "Mihenk.Belge"
    ReadRegStr $3 HKCU "Software\${APP}" "PrevDocAssoc"
    ${If} $3 != ""
      WriteRegStr HKCU "Software\Classes\.mhnk" "" $3
    ${Else}
      DeleteRegKey HKCU "Software\Classes\.mhnk"
    ${EndIf}
  ${EndIf}
  DeleteRegKey HKCU "Software\${APP}"
  DeleteRegKey HKCU "Software\Classes\Mihenk.Belge"
SectionEnd
