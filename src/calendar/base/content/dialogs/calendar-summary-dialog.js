/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Sun Microsystems code.
 *
 * The Initial Developer of the Original Code is Sun Microsystems.
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Michael Buettner <michael.buettner@sun.com>
 *   Philipp Kewisch <mozilla@kewis.ch>
 *   Berend Cornelius <berend.cornelius@sun.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calItipUtils.jsm");
Components.utils.import("resource://calendar/modules/calAlarmUtils.jsm");

/**
 * Sets up the summary dialog, setting all needed fields on the dialog from the
 * item received in the window arguments.
 */
function onLoad() {
    var args = window.arguments[0];
    var item = args.calendarEvent;
    item = item.clone(); // use an own copy of the passed item
    var calendar = item.calendar;
    window.calendarItem = item;

    // the calling entity provides us with an object that is responsible
    // for recording details about the initiated modification. the 'finalize'-property
    // is our hook in order to receive a notification in case the operation needs
    // to be terminated prematurely. this function will be called if the calling
    // entity needs to immediately terminate the pending modification. in this
    // case we serialize the item and close the window.
    if (args.job) {

        // keep this context...
        var self = this;

        // store the 'finalize'-functor in the provided job-object.
        args.job.finalize = function finalize() {

            // store any pending modifications...
            self.onAccept();

            let item = window.calendarItem;

            // ...and close the window.
            window.close();

            return item;
        };
    }
// INVERSE - BEGIN
    //window.readOnly = calendar.readOnly;
    window.readOnly = true;
    if (isCalendarWritable(calendar)) {
        window.readOnly = false;
    } else {
        if (calendar.type == "caldav") {
            var realCalendar = calendar.getProperty("cache.uncachedCalendar");
            if (!realCalendar) {
                realCalendar = calendar;
            }
            realCalendar = realCalendar.wrappedJSObject;
            var cache = realCalendar.mItemInfoCache;
            if (cache[item.id]) {
                /* We don't need to setup an observer here as we know the
                   entry was initialized from calendar-item-editing.js */
                let opListener = {
                    onGetResult: function(calendar, status, itemType, detail, count, items) {
                        ASSERT(false, "unexpected!");
                    },
                    onOperationComplete: function(opCalendar, opStatus, opType, opId, opDetail) {
                        if (Components.isSuccessCode(status)) {
                            if (opDetail) {
                                window.readOnly = !(opDetail.userCanModify || opDetail.userCanRespond());
                            }
                        }
                    }
                };
                let aclMgr = Components.classes["@inverse.ca/calendar/caldav-acl-manager;1"]
                                       .getService(Components.interfaces.calICalDAVACLManager);
                aclMgr.getItemEntry(calendar, cache[item.id].locationPath, opListener);
            }
        }
    }
    // INVERSE - END
    if (!window.readOnly && calInstanceOf(calendar, Components.interfaces.calISchedulingSupport)) {
        var attendee = calendar.getInvitedAttendee(item);
        if (attendee) {
            // if this is an unresponded invitation, preset our default alarm values:
            if (!item.getAlarms({}).length &&
                (attendee.participationStatus == "NEEDS-ACTION")) {
                cal.alarms.setDefaultValues(item);
            }

            window.attendee = attendee.clone();
            // Since we don't have API to update an attendee in place, remove
            // and add again. Also, this is needed if the attendee doesn't exist
            // (i.e REPLY on a mailing list)
            item.removeAttendee(attendee);
            item.addAttendee(window.attendee);
        }
    }

    document.getElementById("item-title").value = item.title;

    document.getElementById("item-start-row").Item = item;
    document.getElementById("item-end-row").Item = item;

    updateInvitationStatus();

    // show reminder if this item is *not* readonly.
    // this case happens for example if this is an invitation.
    var calendar = window.arguments[0].calendarEvent.calendar;
    var supportsReminders =
        (calendar.getProperty("capabilities.alarms.oninvitations.supported") !== false);
    if (!window.readOnly && supportsReminders) {
        document.getElementById("reminder-row").removeAttribute("hidden");
        loadReminders(window.calendarItem.getAlarms({}));
        updateReminder();
    }

    updateRepeatDetails();
    updateAttendees();
    updateLink();

    var location = item.getProperty("LOCATION");
    if (location && location.length) {
        document.getElementById("location-row").removeAttribute("hidden");
        document.getElementById("item-location").value = location;
    }

    var categories = item.getCategories({});
    if (categories.length > 0) {
        document.getElementById("category-row").removeAttribute("hidden");
        document.getElementById("item-category").value = categories.join(", "); // TODO l10n-unfriendly
    }

    var organizer = item.organizer;
    if (organizer && organizer.id) {
        document.getElementById("organizer-row").removeAttribute("hidden");

        if (organizer.commonName && organizer.commonName.length) {
            document.getElementById("item-organizer").value = organizer.commonName;
            document.getElementById("item-organizer").setAttribute("tooltiptext", organizer.toString());
        } else if (organizer.id && organizer.id.length) {
            document.getElementById("item-organizer").value = organizer.toString();
        }
    }

    var status = item.getProperty("STATUS");
    if (status && status.length) {
        var statusRow = document.getElementById("status-row");
        for (var i = 0; i < statusRow.childNodes.length; i++) {
            if (statusRow.childNodes[i].getAttribute("status") == status) {
                statusRow.removeAttribute("hidden");
                if (status == "CANCELLED" && cal.isToDo(item)) {
                    // There are two labels for CANCELLED, the second one is for
                    // todo items. Increment the counter here.
                    i++;
                }
                statusRow.childNodes[i].removeAttribute("hidden");
                break;
            }
        }
    }

    if (item.hasProperty("DESCRIPTION")) {
        var description = item.getProperty("DESCRIPTION");
        if (description && description.length) {
            document.getElementById("item-description-box")
                .removeAttribute("hidden");
            var textbox = document.getElementById("item-description");
            textbox.value = description;
            textbox.inputField.readOnly = true;
        }
    }

    document.title = item.title;

    // If this item is read only we remove the 'cancel' button as users
    // can't modify anything, thus we go ahead with an 'ok' button only.
    if (window.readOnly) {
        document.documentElement.getButton("cancel").setAttribute("collapsed", "true");
    }

    window.focus();
    opener.setCursor("auto");
}

function findDelegationAttendees(aItem, delegationQualifier, delegate) {
    let attendees = [];

    // dump("qualifier: " + delegationQualifier + "\n");
    let currentAttendee = aItem.getAttendeeById(delegate.id);
    while (currentAttendee) {
        let attendeeId = currentAttendee.getProperty(delegationQualifier);
        if (attendeeId && attendeeId.length > 0) {
            currentAttendee = aItem.getAttendeeById(attendeeId);
            if (currentAttendee) {
                // dump("  current delegate/delegator: " + currentAttendee.id + "\n");
                attendees.push(currentAttendee);
            } else {
                dump("  ** not found: " + attendeeId + "\n");
            }
        } else {
            currentAttendee = null;
        }
    }

    return attendees;
}

function saveDelegationInfo() {
    dump("saveDelegationInfo\n");
    let validated = true;

    let oldDelegate = null;
    let keepOldDelegate = false;
    let oldDelegateEmail = window.attendee.getProperty("DELEGATED-TO");
    dump("  oldDelegateEmail: " + oldDelegateEmail + "\n");
    if (oldDelegateEmail && oldDelegateEmail.length > 0) {
        oldDelegate = window.calendarItem.getAttendeeById(oldDelegateEmail);
        dump("  oldDelegate: " + oldDelegate + "\n");
    }

    if (window.attendee.participationStatus == "DELEGATED") {
        let delegateField = document.getElementById("item-delegate");
        // let delegateCB = document.getElementById("item-delegate-staytuned");

        let emails = {};
        let names = {};
        let parser = Components.classes["@mozilla.org/messenger/headerparser;1"]
                               .getService(Components.interfaces.nsIMsgHeaderParser);
        parser.parseHeadersWithArray(delegateField.value, emails, names, {});
        if (emails.value.length > 0 && emails.value[0].indexOf("@") > 0) {
            let newDelegateEmail = "mailto:" + emails.value[0];
            dump("  newDelegateEmail: " + newDelegateEmail + "\n");
            if (newDelegateEmail == oldDelegateEmail) {
                dump("  same delegate\n");
                keepOldDelegate = true;
            } else {
                if (window.calendarItem.organizer.id == newDelegateEmail
                    || window.calendarItem.getAttendeeById(newDelegateEmail)) {
                    window.alert(calGetString("calendar-event-dialog",
                                              "The selected delegate is already present in the attendees list."));
                    validated = false;
                } else {
                    let newDelegate
                        = Components.classes["@mozilla.org/calendar/attendee;1"]
                        .createInstance(Components.interfaces.calIAttendee);
                    newDelegate.isOrganizer = false;
                    newDelegate.id = newDelegateEmail;
                    newDelegate.participationStatus = "NEEDS-ACTION";
                    newDelegate.role = "REQ-PARTICIPANT";
                    newDelegate.rsvp = "TRUE";
                    if (names.value[0].length > 0) {
                        newDelegate.commonName = names.value[0];
                    }
                    newDelegate.setProperty("DELEGATED-FROM", window.attendee.id);
                    window.attendee.setProperty("DELEGATED-TO", newDelegateEmail);
                    window.calendarItem.addAttendee(newDelegate);
                    dump("  delegate attendee added\n");
                    // if (delegateCB.checked) {
                    //     window.attendee.role = "NON-PARTICIPANT";
                    // } else {
                    //     window.attendee.role = "";
                    // }
                }
            }
        } else {
            window.alert(calGetString("calendar-event-dialog",
                                      "The delegate must be a valid contact name."));
            delegateField.select();
            validated = false;
        }
    } else {
        window.attendee.deleteProperty("DELEGATED-TO");
        window.attendee.role = "REQ-PARTICIPANT";
        window.attendee.rsvp = "TRUE";
    }

    if (!keepOldDelegate && oldDelegate) {
        let oldDelegates = findDelegationAttendees(window.calendarItem,
                                                   "DELEGATED-TO",
                                                   oldDelegate);
        window.calendarItem.removeAttendee(oldDelegate);
        dump("  summary: old delegates: " + oldDelegates.join(", ") + "\n");
        for (let i = 0; i < oldDelegates.length; i++) {
            window.calendarItem.removeAttendee(oldDelegates[i]);
        }
    }

    dump("saveDelegationInfo return: " + validated + "\n");

    return validated;
}

/**
 * Saves any changed information to the item.
 *
 * @return      Returns true if the dialog
 */
function onAccept() {
    dispose();
    if (window.readOnly) {
        return true;
    }

    if (calInstanceOf(window.calendarItem, Components.interfaces.calIEvent)
        && !saveDelegationInfo())
        return false;

    var args = window.arguments[0];
    var oldItem = args.calendarEvent;
    var newItem = window.calendarItem;
    var calendar = newItem.calendar;
    saveReminder(newItem);
    args.onOk(newItem, calendar, oldItem);
    window.calendarItem = newItem;
    return true;
}

/**
 * Called when closing the dialog and any changes should be thrown away.
 */
function onCancel() {
    dispose();
    return true;
}

/**
 * Sets the dialog's invitation status dropdown to the value specified by the
 * user's invitation status.
 */
function updateInvitationStatus() {
    if (!window.readOnly) {
        if (window.attendee && window.attendee.rsvp) {
            var invitationRow =
                document.getElementById("invitation-row");
            invitationRow.removeAttribute("hidden");
            var statusElement =
                document.getElementById("item-participation");
            statusElement.value = window.attendee.participationStatus;
            var delegate = document.getElementById("item-delegate");
            // var delegateCB = document.getElementById("item-delegate-staytuned");
            if (statusElement.value == "DELEGATED") {
                delegate.removeAttribute("collapsed");
                // delegateCB.removeAttribute("disabled");
                var delegateEmail = window.attendee.getProperty("DELEGATED-TO");
                if (delegateEmail && delegateEmail.length > 0) {
                    var delegateAtt
                        = window.calendarItem.getAttendeeById(delegateEmail);
                    var email = delegateEmail.replace(/^mailto:/i, "");
                    var name = delegateAtt.commonName;
                    if (name && name.length) {
                        name += " <" + email + ">";
                    } else {
                        name = email;
                    }
                    delegate.value = name;
                }
            } else {
                delegate.setAttribute("collapsed", "true");
                // delegateCB.setAttribute("disabled", "true");
            }
        }
    }
}

/**
 * When the summary dialog is showing an invitation, this function updates the
 * user's invitation status from the value chosen in the dialog.
 *
 * XXX rename me!
 */
function updateInvitation() {
  var statusElement = document.getElementById("item-participation");
  if (window.attendee) {
      window.attendee.participationStatus = statusElement.value;
      var delegate = document.getElementById("item-delegate");
      // var delegateCB = document.getElementById("item-delegate-staytuned");
      if (statusElement.value == "DELEGATED") {
          delegate.removeAttribute("collapsed");
          // delegateCB.removeAttribute("disabled");
      } else {
          delegate.setAttribute("collapsed", "true");
          // delegateCB.setAttribute("disabled", "true");
      }
  }
}

/**
 * Updates the dialog w.r.t recurrence, i.e shows a text describing the item's
 * recurrence)
 */
function updateRepeatDetails() {
    var args = window.arguments[0];
    var item = args.calendarEvent;

    // step to the parent (in order to show the
    // recurrence info which is stored at the parent).
    item = item.parentItem;

    // retrieve a valid recurrence rule from the currently
    // set recurrence info. bail out if there's more
    // than a single rule or something other than a rule.
    var recurrenceInfo = item.recurrenceInfo;
    if (!recurrenceInfo) {
        return;
    }

    document.getElementById("repeat-row").removeAttribute("hidden");

    // First of all collapse the details text. If we fail to
    // create a details string, we simply don't show anything.
    // this could happen if the repeat rule is something exotic
    // we don't have any strings prepared for.
    var repeatDetails = document.getElementById("repeat-details");
    repeatDetails.setAttribute("collapsed", "true");

    // Try to create a descriptive string from the rule(s).
    var kDefaultTimezone = calendarDefaultTimezone();
    var startDate =  item.startDate || item.entryDate;
    var endDate = item.endDate || item.dueDate;
    startDate = startDate ? startDate.getInTimezone(kDefaultTimezone) : null;
    endDate = endDate ? endDate.getInTimezone(kDefaultTimezone) : null;
    var detailsString = recurrenceRule2String(
        recurrenceInfo, startDate, endDate, startDate.isDate);

    // Now display the string...
    if (detailsString) {
        var lines = detailsString.split("\n");
        repeatDetails.removeAttribute("collapsed");
        while (repeatDetails.childNodes.length > lines.length) {
            repeatDetails.removeChild(repeatDetails.lastChild);
        }
        var numChilds = repeatDetails.childNodes.length;
        for (var i = 0; i < lines.length; i++) {
            if (i >= numChilds) {
                var newNode = repeatDetails.childNodes[0]
                                           .cloneNode(true);
                repeatDetails.appendChild(newNode);
            }
            repeatDetails.childNodes[i].value = lines[i];
            repeatDetails.childNodes[i].setAttribute("tooltiptext",
                                                     detailsString);
        }
    }
}

/**
 * Updates the attendee listbox, displaying all attendees invited to the
 * window's item.
 */
function updateAttendees() {
    var args = window.arguments[0];
    var item = args.calendarEvent;
    var attendees = item.getAttendees({});
    if (attendees && attendees.length) {
        document.getElementById("item-attendees").removeAttribute("hidden");
        var listbox = document.getElementById("item-attendee-listbox");
        var modelNode = listbox.getElementsByTagName("listitem")[0];
        listbox.removeChild(modelNode);
        for each (var attendee in attendees) {
            if (attendee.participationStatus != "DELEGATED") {
                var itemNode = modelNode.cloneNode(true);
                listbox.appendChild(itemNode);
                var listcell = itemNode.getElementsByTagName("listcell")[0];
                var image = itemNode.getElementsByTagName("image")[0];
                var label = itemNode.getElementsByTagName("label")[0];
                if (attendee.role) {
                    listcell.setAttribute("role", attendee.role);
                }
                if (window.attendee && attendee.id == window.attendee.id) {
                    listcell.className += " owner-attendee";
                }
                if (attendee.commonName && attendee.commonName.length) {
                    label.value = attendee.commonName;
                    // XXX While this is correct from a XUL standpoint, it doesn't
                    // seem to work on the listcell. Working around this would be an
                    // evil hack, so I'm waiting for it to be fixed in the core
                    // code instead.
                    listcell.setAttribute("tooltiptext", attendee.toString());
                } else {
                    label.value = attendee.toString();
                }
                var delegatedFrom = attendee.getProperty("DELEGATED-FROM");
                if (delegatedFrom && delegatedFrom.length > 0) {
                    var delegatorLabel = (calGetString("calendar-event-dialog",
                                                      "delegated from")
                                          + " ");
                    var delegator = item.getAttendeeById(delegatedFrom);
                    if (delegator) {
                        var delegatorName = delegator.commonName;
                        if (delegatorName && delegatorName.length > 0) {
                            delegatorLabel += delegatorName;
                        } else {
                            delegatorLabel += delegator.toString();
                        }
                    } else {
                        delegatorLabel += " (bug) attendee not found: " + delegatedFrom;
                    }
                    label.value += ", " + delegatorLabel;
                }
                if (attendee.participationStatus) {
                    image.setAttribute("status",
                                       attendee.participationStatus);
                }
                image.removeAttribute("hidden");
            }
        }
    }
}

/**
 * Updates the reminder, called when a reminder has been selected in the
 * menulist.
 */
function updateReminder() {
    commonUpdateReminder();
}

/**
 * Browse the item's attached URL.
 *
 * XXX This function is broken, should be fixed in bug 471967
 */
function browseDocument() {
    var args = window.arguments[0];
    var item = args.calendarEvent;
    var url = item.getProperty("URL")
    launchBrowser(url);
}

/**
 * Extracts the item's organizer and opens a compose window to send the
 * organizer an email.
 */
function sendMailToOrganizer() {
    var args = window.arguments[0];
    var item = args.calendarEvent;

    var organizer = item.organizer;
    if (organizer) {
        if (organizer.id && organizer.id.length) {
            var email = organizer.id.replace(/^mailto:/i, "");

            // Set up the subject
            var emailSubject = calGetString("calendar-event-dialog",
                                            "emailSubjectReply",
                                            [item.title]);

            sendMailTo(email, emailSubject);
        }
    }
}
