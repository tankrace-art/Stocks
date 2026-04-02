#!/bin/bash
# Setup cron job for Nuclear News Dashboard
# Runs daily at 6:00 AM (system timezone)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PYTHON_PATH="$(which python3)"

CRON_CMD="0 6 * * * cd $PROJECT_DIR && $PYTHON_PATH -m nuclear_news.main >> $SCRIPT_DIR/cron.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "nuclear_news.main"; then
    echo "Cron job already exists. Updating..."
    crontab -l 2>/dev/null | grep -v "nuclear_news.main" | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -

echo "Cron job installed successfully!"
echo "Schedule: Daily at 06:00 AM"
echo "Command: $CRON_CMD"
echo ""
echo "To verify: crontab -l"
echo "To remove: crontab -l | grep -v nuclear_news | crontab -"
echo "Log file: $SCRIPT_DIR/cron.log"
