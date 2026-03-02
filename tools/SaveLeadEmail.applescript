-- ═══════════════════════════════════════════
-- YotCRM Mail Rule Script
-- Saves incoming lead emails as .eml files
-- for the forwarder to pick up.
--
-- SETUP: In Mail.app → Settings → Rules:
-- 1. Create rules matching lead emails:
--    • From contains "boatwizard" OR "leads.boatwizard"
--    • From contains "jamesedition"
--    • From contains "rightboat"
--    • From contains "yatco"
--    • Subject contains "New Interested Buyer"
--    • Subject contains "Website Chat Lead"
--    • Subject contains "Price Watch"
--    • Subject contains "BoatTrader"
-- 2. Action: Run AppleScript → select this file
-- ═══════════════════════════════════════════

using terms from application "Mail"
  on perform mail action with messages theMessages for rule theRule
    set inboxFolder to (POSIX path of (path to home folder)) & "YotCRM/inbox/raw_emails/"
    
    -- Ensure directory exists
    do shell script "mkdir -p " & quoted form of inboxFolder
    
    tell application "Mail"
      repeat with theMessage in theMessages
        try
          set msgSource to source of theMessage
          set msgId to id of theMessage
          set ts to do shell script "date +%Y%m%d_%H%M%S"
          set fileName to "lead_" & ts & "_" & msgId & ".eml"
          set filePath to inboxFolder & fileName
          
          -- Write .eml file
          set fileRef to open for access (POSIX file filePath) with write permission
          write msgSource to fileRef as «class utf8»
          close access fileRef
        on error errMsg
          try
            close access fileRef
          end try
          -- Log error but don't stop processing other messages
          do shell script "echo '[" & ts & "] ERROR: " & errMsg & "' >> ~/YotCRM/logs/mail-rule.log"
        end try
      end repeat
    end tell
  end perform mail action with messages
end using terms from
