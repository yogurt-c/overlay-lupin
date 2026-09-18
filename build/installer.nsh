!macro customInstall
  DetailPrint "Adding Windows Firewall rule for LAN discovery"
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Overlay Lupin" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" protocol=UDP profile=private,domain enable=yes'
!macroend

!macro customUnInstall
  DetailPrint "Removing Windows Firewall rule for LAN discovery"
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Overlay Lupin"'
!macroend
