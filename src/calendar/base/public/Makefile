XPIDL_MODULE = calbase

XULRUNNER = /usr/lib/xulrunner-devel-7.0
# INCLUDE_DIR = $(XULRUNNER)/sdk/idl
INCLUDE_DIR = /usr/share/idl/xulrunner-7.0
XPIDL = $(XULRUNNER)/bin/xpidl
XPT_LINK = /usr/bin/python $(XULRUNNER)/sdk/bin/xpt.py link

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
            calISchedulingSupport.idl \
            \
            calICalDAVACLManager.idl

XPIDLXPTS = $(XPIDLSRCS:.idl=.xpt)

.idl.xpt:
	$(XPIDL) -I $(INCLUDE_DIR) -m typelib -e $@ $<

$(XPIDL_MODULE).xpt: $(XPIDLXPTS)
	$(XPT_LINK) $@ $(XPIDLXPTS)

clean:
	$(RM) $(XPIDLXPTS) $(XPIDL_MODULE).xpt *~

.SUFFIXES: .xpt .idl

