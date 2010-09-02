XPIDL_MODULE = calbase

XULRUNNER = /usr/lib/xulrunner-devel-1.9.1
# INCLUDE_DIR = $(XULRUNNER)/sdk/idl
INCLUDE_DIR = /home/wsourdeau/src/mozilla/idls
XPIDL = $(XULRUNNER)/bin/xpidl
XPT_LINK = $(XULRUNNER)/bin/xpt_link

XPIDLSRCS = calIAlarm.idl \
            calIAlarmService.idl \
            calIAttachment.idl \
            calIAttendee.idl \
            calICalendar.idl \
            calICalendarManager.idl \
            calICalendarProvider.idl \
            calICalendarSearchProvider.idl \
            calICalendarView.idl \
            calICalendarViewController.idl \
            calIChangeLog.idl \
            calIDateTime.idl \
            calIDateTimeFormatter.idl \
            calIDuration.idl \
            calIErrors.idl \
            calIEvent.idl \
            calIFreeBusyProvider.idl \
            calIIcsParser.idl \
            calIIcsSerializer.idl \
            calIICSService.idl \
            calIImportExport.idl \
            calIItemBase.idl \
            calIItipItem.idl \
            calIItipTransport.idl \
            calIOperation.idl \
            calIPeriod.idl \
            calIPrintFormatter.idl \
            calIRecurrenceInfo.idl \
            calIRecurrenceDate.idl \
            calIRecurrenceDateSet.idl \
            calIRecurrenceItem.idl \
            calIRecurrenceRule.idl \
            calIRelation.idl \
            calIStatusObserver.idl \
            calITimezone.idl \
            calITimezoneProvider.idl \
            calITodo.idl \
            calITransactionManager.idl \
            calIWeekInfoService.idl \
            calISchedulingSupport.idl

XPIDLXPTS = $(XPIDLSRCS:.idl=.xpt)

.idl.xpt:
	$(XPIDL) -I $(INCLUDE_DIR) -m typelib -e $@ $<

$(XPIDL_MODULE).xpt: $(XPIDLXPTS)
	$(XPT_LINK) $@ $(XPIDLXPTS)

.SUFFIXES: .xpt .idl

