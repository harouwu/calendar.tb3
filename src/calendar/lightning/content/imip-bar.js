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
 * The Original Code is Lightning code.
 *
 * The Initial Developer of the Original Code is Simdesk Technologies Inc.
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Clint Talbert <ctalbert.moz@gmail.com>
 *   Matthew Willis <lilmatt@mozilla.com>
 *   Philipp Kewisch <mozilla@kewis.ch>
 *   Daniel Boelzle <daniel.boelzle@sun.com>
 *   Martin Schroeder <mschroeder@mozilla.x-home.org>
 *   Simon Vaillancourt <simon.at.orcl@gmail.com>
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

/**
 * This bar lives inside the message window.
 * Its lifetime is the lifetime of the main thunderbird message window.
 */
var gItipItem;
var gDelegateInfo;
var gCalItemsArrayFound = [];

var gIMIPCalendars;
var gIdentities = null;

function ltnGetMsgRecipient() {
    let msgHdr = gMessageDisplay.displayedMessage;
    if (!msgHdr) {
        return null;
    }

    var identities;
    if (msgHdr.accountKey) {
        // First, check if the message has an account key. If so, we can use the
        // account identities to find the correct recipient
        identities = getAccountManager().getAccount(msgHdr.accountKey).identities;
    } else {
        // Without an account key, we have to revert back to using the server
        identities = getAccountManager().GetIdentitiesForServer(msgHdr.folder.server);
    }

    var emailMap = {};
    if (identities.Count() == 0) {
        // If we were not able to retrieve identities above, then we have no
        // choice but to revert to the default identity
        var identity = getAccountManager().defaultAccount.defaultIdentity;
        if (!identity) {
            // If there isn't a default identity (i.e Local Folders is your
            // default identity), then go ahead and use the first available
            // identity.
            var allIdentities = getAccountManager().allIdentities;
            if (allIdentities.Count() > 0) {
                identity = allIdentities.GetElementAt(0)
                                        .QueryInterface(Components.interfaces.nsIMsgIdentity);
            } else {
                // If there are no identities at all, we cannot get a recipient.
                return null;
            }
        }
        emailMap[identity.email.toLowerCase()] = true;
    } else {
        // Build a map of usable email addresses
        for (var i = 0; i < identities.Count(); i++) {
            var identity = identities.GetElementAt(i)
                                     .QueryInterface(Components.interfaces.nsIMsgIdentity);
            emailMap[identity.email.toLowerCase()] = true;
        }
    }


    var hdrParser = Components.classes["@mozilla.org/messenger/headerparser;1"]
                              .getService(Components.interfaces.nsIMsgHeaderParser);
    var emails = {};
    // First check the recipient list
    hdrParser.parseHeadersWithArray(msgHdr.recipients, emails, {}, {});
    for each (var recipient in emails.value) {
        if (emailMap[recipient.toLowerCase()]) {
            // Return the first found recipient
            return recipient;
        }
    }
    // Maybe we are in the CC list?
    hdrParser.parseHeadersWithArray(msgHdr.ccList, emails, {}, {});
    for each (var recipient in emails.value) {
        if (emailMap[recipient.toLowerCase()]) {
            // Return the first found recipient
            return recipient;
        }
    }

    // Hrmpf. Looks like delegation or maybe Bcc.
    return null;
}

function ltnIsSchedulingCalendar(cal) {
    return (isCalendarWritable(cal) &&
            cal.getProperty("organizerId") &&
            cal.getProperty("itip.transport"));
}

const ltnOnItipItem = {
    observe: function ltnOnItipItem_observe(subject, topic, state) {
        if (topic == "onItipItemCreation") {
            let itipItem = null;
            try {
                if (!subject) {
                    let sinkProps = msgWindow.msgHeaderSink.properties;
                    // This property was set by lightningTextCalendarConverter.js
                    itipItem = sinkProps.getPropertyAsInterface("itipItem", Components.interfaces.calIItipItem);
                }
            } catch (e) {
                // This will throw on every message viewed that doesn't have the
                // itipItem property set on it. So we eat the errors and move on.

                // XXX TODO: Only swallow the errors we need to. Throw all others.
            }
            if (!itipItem) {
                return;
            }

            // Get the recipient identity and save it with the itip item.
            itipItem.identity = ltnGetMsgRecipient();

            // We are only called upon receipt of an invite, so ensure that isSend
            // is false.
            itipItem.isSend = false;

            // XXX Get these from preferences
            itipItem.autoResponse = Components.interfaces.calIItipItem.USER;

            let imipMethod = gMessageDisplay.displayedMessage.getStringProperty("imip_method");
            if (imipMethod && imipMethod.length != 0 && imipMethod.toLowerCase() != "nomethod") {
                itipItem.receivedMethod = imipMethod.toUpperCase();
            } else { // There is no METHOD in the content-type header (spec violation).
                     // Fall back to using the one from the itipItem's ICS.
                imipMethod = itipItem.receivedMethod;
            }
            cal.LOG("iTIP method: " + imipMethod);
///////////////////////////////////
 try {
        gItipItem = itipItem;

        /* bug 396182 reveals itself here */
        gItipItem.getItemList({});
    } catch(e) {
        gItipItem = null;
        gCalItemsArrayFound = [];
        gIMIPCalendars = null;
        gIdentities = null;

//         idump("an exception occured parsing itip item: " + e);
        LOG("an exception occured parsing itip item: " + e);
        return;
    }
    ////////////////////////

            let writableCalendars = getCalendarManager().getCalendars({}).filter(ltnIsSchedulingCalendar);
            if (writableCalendars.length > 0) {
                let compCal = Components.classes["@mozilla.org/calendar/calendar;1?type=composite"]
                                        .createInstance(Components.interfaces.calICompositeCalendar);
                writableCalendars.forEach(compCal.addCalendar, compCal);
                itipItem.targetCalendar = compCal;

                let imipBar = document.getElementById("imip-bar");
                imipBar.setAttribute("collapsed", "false");
                ////////////////////
                 setupIMIPCalendars(imipMethod);
                switch (itipItem.receivedMethod) {
                    case "REFRESH":
                        imipBar.setAttribute("label", ltnGetString("lightning", "imipBarRefreshText"));
                        break;
                    case "REQUEST":
                        processRequestMsg();
                        break;
                    case "PUBLISH":
                        imipBar.setAttribute("label", ltnGetString("lightning", "imipBarPublishText"));
                        break;
                    case "CANCEL":
                        imipBar.setAttribute("label", ltnGetString("lightning", "imipBarCancelText"));
                        break;
                    case "REPLY":
                        imipBar.setAttribute("label", ltnGetString("lightning", "imipBarReplyText"));
                        break;
                    default:
                        // Bug xxxx TBD: Something went wrong or we found a message we don't
                        // support yet. We can show a "This method is not supported in this
                        // version" or simply hide the iMIP bar at this point
                        imipBar.setAttribute("label", ltnGetString("lightning", "imipBarUnsupportedText"));
                        cal.ERROR("Unknown iTIP method: " + itipItem.receivedMethod);
                        return;
                }
                cal.itip.processItipItem(itipItem, ltnItipOptions);
            }
        }
    }
};

/**
 * Add self to gMessageListeners defined in msgHdrViewOverlay.js
 */
function ltnImipOnLoad() {
    let listener = {
        onStartHeaders: function onImipStartHeaders() {
            var imipBar = document.getElementById("imip-bar");
            imipBar.setAttribute("collapsed", "true");
            hideElement("imip-button1");
            hideElement("imip-button2");
            hideElement("imip-button3");
            // A new message is starting.
            // Clear our iMIP/iTIP stuff so it doesn't contain stale information.
            gItipItem = null;
        },
        onEndHeaders: function onImipEndHeaders() {
        }
    };
    gMessageListeners.push(listener);

    // Set up our observers
    cal.getObserverService().addObserver(ltnOnItipItem, "onItipItemCreation", false);
}

function ltnImipOnUnload() {
    removeEventListener("messagepane-loaded", ltnImipOnLoad, true);
    removeEventListener("messagepane-unloaded", ltnImipOnUnload, true);

    gItipItem = null;
    cal.getObserverService().removeObserver(ltnOnItipItem, "onItipItemCreation");
}

addEventListener("messagepane-loaded", ltnImipOnLoad, true);
addEventListener("messagepane-unloaded", ltnImipOnUnload, true);

var gItipItem = null;
var gActionFunc = null;

function ltnExecAction(partStat) {
    switch (gActionFunc.method) {
        // methods that don't require the calendar chooser:
        case "REFRESH":
        case "REQUEST:UPDATE":
        case "REQUEST:UPDATE-MINOR":
        case "PUBLISH:UPDATE":
        case "REPLY":
        case "CANCEL":
            break;
        default: {
            let cal = ltnGetTargetCalendar(gItipItem);
            if (!cal) {
                return true; // cancelled
            }
            gItipItem.targetCalendar = cal;
            break;
        }
    }

    // hide the buttons now, to disable pressing them twice...
    hideElement("imip-button1");
    hideElement("imip-button2");
    hideElement("imip-button3");

    let opListener = {
        onOperationComplete: function ltnItipActionListener_onOperationComplete(aCalendar,
                                                                                aStatus,
                                                                                aOperationType,
                                                                                aId,
                                                                                aDetail) {
            // For now, we just state the status for the user something very simple
            let imipBar = document.getElementById("imip-bar");
            if (Components.isSuccessCode(aStatus)) {
                switch (aOperationType) {
                    case Components.interfaces.calIOperationListener.ADD:
                        imipBar.setAttribute("label", ltnGetString("lightning", "imipAddedItemToCal"));
                        break;
                    case Components.interfaces.calIOperationListener.MODIFY:
                        imipBar.setAttribute("label", ltnGetString("lightning", "imipUpdatedItem"));
                        break;
                    case Components.interfaces.calIOperationListener.DELETE:
                        imipBar.setAttribute("label", ltnGetString("lightning", "imipCanceledItem"));
                        break;
                }
            } else {
                let msg = ltnGetString("lightning", "imipBarProcessingFailed", [aStatus.toString(16)]);
                imipBar.setAttribute("label", msg);
                showError(msg);
            }
        },
        onGetResult: function ltnItipActionListener_onGetResult(aCalendar,
                                                                aStatus,
                                                                aItemType,
                                                                aDetail,
                                                                aCount,
                                                                aItems) {
        }
    };

    try {
        gActionFunc(opListener, partStat);
    } catch (exc) {
        Components.utils.reportError(exc);
    }

    return true;
}

function ltnItipOptions(itipItem, rc, actionFunc) {
    var imipBar = document.getElementById("imip-bar");
    if (Components.isSuccessCode(rc)) {
        if (!actionFunc) {
            // This case, they clicked on an old message that has already been
            // added/updated, we want to tell them that.
            imipBar.setAttribute("label", ltnGetString("lightning", "imipBarAlreadyProcessedText"));
            return;
        }

        gItipItem = itipItem;
        gActionFunc = actionFunc;

        let button1 = document.getElementById("imip-button1");
        let button2 = document.getElementById("imip-button2");
        let button3 = document.getElementById("imip-button3");
        cal.LOG("iTIP options on: " + actionFunc.method); //alert(actionFunc.method);
        switch (actionFunc.method) {
            case "REPLY":
                // fall-thru intended
            case "PUBLISH:UPDATE":
            case "REQUEST:UPDATE-MINOR":
                imipBar.setAttribute("label", ltnGetString("lightning", "imipBarUpdateText"));
                button1.setAttribute("label", ltnGetString("lightning", "imipUpdate.label"));
                button1.setAttribute("oncommand", "return ltnExecAction();");
                showElement(button1);
                break;
            case "PUBLISH":
                button1.setAttribute("label", ltnGetString("lightning", "imipAddToCalendar.label"));
                button1.setAttribute("oncommand", "return ltnExecAction();");
                showElement(button1);
                break;
            case "REQUEST:UPDATE":
                imipBar.setAttribute("label", ltnGetString("lightning", "imipBarUpdateText"));
                // fall-thru intended
            case "REQUEST": {
               processRequestMsg();
                break;
            }
            case "CANCEL": {
                button1.setAttribute("label", ltnGetString("lightning", "imipCancelInvitation.label"));
                button1.setAttribute("oncommand", "return ltnExecAction();");
                showElement(button1);
                break;
            }
            case "REFRESH": {
                button1.setAttribute("label", ltnGetString("lightning", "imipSend.label"));
                button1.setAttribute("oncommand", "return ltnExecAction();");
                showElement(button1);
                break;
            }
            default:
                imipBar.setAttribute("label", ltnGetString("lightning", "imipBarUnsupportedText"));
                break;
        }
    } else {
        imipBar.setAttribute("label", ltnGetString("lightning", "imipBarUnsupportedText"));
    }
}

function ltnGetTargetCalendar(itipItem) {
    let calendarToReturn = null;
    let calendars = getCalendarManager().getCalendars({}).filter(ltnIsSchedulingCalendar);

    if (itipItem.receivedMethod == "REQUEST") {
        // try to further limit down the list to those calendars that are configured to a matching attendee;
        let item = itipItem.getItemList({})[0];
        let matchingCals = calendars.filter(
            function(calendar) {
                return (cal.getInvitedAttendee(item, calendar) != null);
            });
        // if there's none, we will show the whole list of calendars:
        if (matchingCals.length > 0) {
            calendars = matchingCals;
        }
    }

    if (calendars.length == 0) {
        var stringBundle = getLightningStringBundle();
        window.alert(stringBundle.GetStringFromName("imipNoCalendarAvailable"));
    }
    else if (calendars.length == 1) {
        // There's only one calendar, so it's silly to ask what calendar
        // the user wants to import into.
        calendarToReturn = calendars[0];
    } else {
        // Ask what calendar to import into
        var args = {};
        args.calendars = calendars;
        args.onOk = function selectCalendar(aCal) { calendarToReturn = aCal; };
        args.promptText = calGetString("calendar", "importPrompt");
        openDialog("chrome://calendar/content/chooseCalendarDialog.xul",
                   "_blank", "chrome,titlebar,modal,resizable", args);
    }

    return calendarToReturn;
}

function imipOnLoad() {//alert("loaded");
    var listener = {};
    listener.onStartHeaders = onImipStartHeaders;
    listener.onEndHeaders = onImipEndHeaders;
    gMessageListeners.push(listener);

    // Set up our observers
    var observerSvc = Components.classes["@mozilla.org/observer-service;1"]
                                .getService(Components.interfaces.nsIObserverService);
    observerSvc.addObserver(onItipItem, "onItipItemCreation", false);
}

//new methods
function allUserCalendars() {
    var allCalendars = [];

    var aclMgr;
    try {
        aclMgr = Components.classes["@inverse.ca/calendar/caldav-acl-manager;1"]
                           .getService(Components.interfaces.nsISupports)
                           .wrappedJSObject;
    } catch(e) {
        aclMgr = null;
    }
    var mgr = getCalendarManager();
    mgr.getCalendars({}).forEach(function(cal) {
        checkAndIncludeIMIPCalendar(allCalendars, cal, aclMgr);
    });

    return allCalendars;
}

function checkAndIncludeIMIPCalendar(allCalendars, cal, aclMgr) {
    if (isCalendarWritable(cal)) {
        var aclMgrDone = false;
        if (cal.type == "caldav") {
            //                 idump("  uri: " + cal.uri.spec);
            var entry = (aclMgr
                         ? aclMgr.calendarEntry(cal.uri)
                         : null);
            var calIdentities;
            if (entry && entry.isCalendarReady()) {
                calIdentities = entry.ownerIdentities;
                aclMgrDone = true;
            }
        }

        if (!aclMgrDone) {
            calIdentities = [];
            var imipIdentity = cal.getProperty["imip.identity"];
            if (imipIdentity) {
                calIdentities.push(imipIdentity);
            }
        }
        if (calIdentities.length > 0
            && recipientMatchIdentities(calIdentities)) {
            allCalendars.push(cal);
        }
    }
}

function setupMsgIdentities() {
    if (!gIdentities) {
        var acctmgr = Components.classes["@mozilla.org/messenger/account-manager;1"]
                      .getService(Components.interfaces.nsIMsgAccountManager);
        var msgHdr = gMessageDisplay.displayedMessage;
        if (msgHdr.accountKey) {
            // First, check if the message has an account key. If so, we can use the
            // account identities to find the correct recipient
            gIdentities = acctmgr.getAccount(msgHdr.accountKey).identities;
        } else {
            // Without an account key, we have to revert back to using the server
            gIdentities = acctmgr.GetIdentitiesForServer(msgHdr.folder.server);
        }
    }
}

function recipientMatchIdentities(identities) {
    setupMsgIdentities();
    var matchIdentities = false;

//     idump("recipientMatchIdentities");

    for (var i = 0; !matchIdentities && i < gIdentities.Count(); i++) {
        var testIdentity = gIdentities.GetElementAt(i)
                           .QueryInterface(Components.interfaces.nsIMsgIdentity);
//         idump("test identity: " + testIdentity.email);
        for (var j = 0; !matchIdentities && j < identities.length; j++) {
//             idump("  identity: " + identities[j].email);
            matchIdentities = (identities[j].email == testIdentity.email);
        }
    }

    return matchIdentities;
}

function processRequestMsg() {
    // According to the specification, we have to determine if the event ID
    // already exists on the calendar of the user - that means we have to search
    // them all. :-(
    var existingItemSequence = -1;

//     idump("processRequestMsg");
//     var compCal = createItipCompositeCalendar();

    // Per iTIP spec (new Draft 4), multiple items in an iTIP message MUST have
    // same ID, this simplifies our searching, we can just look for Item[0].id
    var itemList = gItipItem.getItemList({ });
    var newSequence = itemList[0].getProperty("SEQUENCE");

    // Make sure we don't have a pre Outlook 2007 appointment, but if we do
    // use Microsoft's Sequence number. I <3 MS
    if ((newSequence == "0") &&
        itemList[0].hasProperty("X-MICROSOFT-CDO-APPT-SEQUENCE")) {
        newSequence = itemList[0].getProperty("X-MICROSOFT-CDO-APPT-SEQUENCE");
    }

    var onFindItemListener = {
        onOperationComplete:
        function ooc(aCalendar, aStatus, aOperationType, aId, aDetail) {
//             idump("onOperationComplete");
        },

        onGetResult:
        function ogr(aCalendar, aStatus, aItemType, aDetail, aCount, aItems) {
//             idump("onGetResult");
            if (aCount && aItems[0] && !this.processedId) {
                this.processedId = true;
                var existingSequence = aItems[0].getProperty("SEQUENCE");

                // Handle the microsoftism foolishness
                if ((existingSequence == "0") &&
                    itemList[0].hasProperty("X-MICROSOFT-CDO-APPT-SEQUENCE")) {
                    existingSequence = aItems[0].getProperty("X-MICROSOFT-CDO-APPT-SEQUENCE");
                }

                if (aCalendar.getProperty("itip.disableRevisionChecks")) {
                    displayRequestMethod(1, 0); // force to be an update
                } else {
                    displayRequestMethod(newSequence, existingSequence);
                }
            }
        }
    };

    if (gIMIPCalendars.length > 0) {
        // Search
        for each (var cal in gIMIPCalendars) {
            cal.getItem(itemList[0].id, onFindItemListener);
        }
        if (!onFindItemListener.processedId) {
            displayRequestMethod(newSequence, -1);
        }
    } else {
        displayRequestMethod(0, 1);
    }
}

function displayRequestMethod(newItemSequence, existingItemSequence) {
//     idump("displayRequestMethod (" + newItemSequence
//           + ", " + existingItemSequence + ")");
//     idump(STACK(50));
    // Three states here:
    // 0 = the new event does not exist on the calendar (therefore, this is an add)
    //     (Item does not exist yet: existingItemSequence == -1)
    // 1 = the event does exist and contains a proper update (this is an update)
    //     (Item has been updated: newSequence > existingSequence)
    // 2 = the event clicked on is an old update and should NOT be applied
    //     (Item is an old message that has already been added/updated: new <= existing)
    var updateValue = 0;

    if (existingItemSequence == -1) {
        updateValue = 0;
    } else if (newItemSequence > existingItemSequence) {
        updateValue = 1;
    } else {
        updateValue = 2;
    }

//     idump("updateValue: " + updateValue );
    // now display the proper message for this update type:

    var imipBar = document.getElementById("imip-bar");
    if (updateValue) {
        // This is a message updating existing event(s). But updateValue could
        // indicate that this update has already been applied, check that first.
        if (updateValue == 2) {
            // This case, they clicked on an old message that has already been
            // added/updated, we want to tell them that.
            imipBar.setAttribute("label", ltnGetString("lightning", "imipBarAlreadyAddedText"));

            hideElement("imip-button1");
            hideElement("imip-button2");
            hideElement("imip-button3");
            hideElement("imip-button4");
        } else {
            // Legitimate update, let's offer the update path
            imipBar.setAttribute("label", ltnGetString("lightning", "imipBarUpdateText"));

            var button = document.getElementById("imip-button1");
            showElement(button);
            button.setAttribute("label", ltnGetString("lightning", "imipUpdateInvitation.label"));
            button.setAttribute("oncommand", "setAttendeeResponse('ACCEPTED', 'CONFIRMED');");

            // Create a DECLINE button (user chooses not to attend the updated event)
            button = document.getElementById("imip-button2");
            showElement(button);
            button.setAttribute("label", ltnGetString("lightning", "imipDeclineInvitation.label"));
            button.setAttribute("oncommand", "setAttendeeResponse('DECLINED', 'CONFIRMED');");

            // Create a ACCEPT TENTATIVE button
            button = document.getElementById("imip-button3");
            showElement(button);
            button.setAttribute("label", ltnGetString("lightning", "imipAcceptTentativeInvitation.label"));
            button.setAttribute("oncommand", "setAttendeeResponse('TENTATIVE', 'CONFIRMED');");

            // Create a DELEGATE button
            button = document.getElementById("imip-button4");
            showElement(button);
            button.setAttribute("label", ltnGetString("lightning", "imipDelegateInvitation.label"));
            button.setAttribute("oncommand", "setAttendeeResponse('DELEGATED', 'CONFIRMED');");
        }
    } else {
        imipBar.setAttribute("label", ltnGetString("lightning", "imipBarRequestText"));

        var button = document.getElementById("imip-button1");
        showElement(button);
        button.setAttribute("label", ltnGetString("lightning", "imipAcceptInvitation.label"));
        button.setAttribute("oncommand", "setAttendeeResponse('ACCEPTED', 'CONFIRMED');");

        // Create a DECLINE button
        button = document.getElementById("imip-button2");
        showElement(button);
        button.setAttribute("label", ltnGetString("lightning", "imipDeclineInvitation.label"));
        button.setAttribute("oncommand", "setAttendeeResponse('DECLINED', 'CONFIRMED');");

        // Create a ACCEPT TENTATIVE button
        button = document.getElementById("imip-button3");
        showElement(button);
        button.setAttribute("label", ltnGetString("lightning", "imipAcceptTentativeInvitation.label"));
        button.setAttribute("oncommand", "setAttendeeResponse('TENTATIVE', 'CONFIRMED');");

        // Create a DELEGATE button
        button = document.getElementById("imip-button4");
        showElement(button);
        button.setAttribute("label", ltnGetString("lightning", "imipDelegateInvitation.label"));
        button.setAttribute("oncommand", "setAttendeeResponse('DELEGATED', 'CONFIRMED');");
    }
}

function setupIMIPCalendars(imipMethod) {
    var allCalendars = allUserCalendars();
    if (allCalendars.length) {
        var foundTuple = findItipItemCalendar(allCalendars);
        if (foundTuple) {
//             idump("tuple found");
            refreshCalendars([foundTuple[0]],
                             refreshItemCalendarCallback,
                             {item: foundTuple[1], method: imipMethod});
        } else {
//             idump("tuple not found");
            refreshCalendars(allCalendars,
                             refreshAllCalendarsCallback, imipMethod);
        }
    } else {
        gIMIPCalendars = allCalendars;
        return;
    }
}

function refreshCalendars(calendars, callback, data) {
    var refreshObserver = new imipBarRefreshObserver(calendars,
                                                     callback,
                                                     data);
    for each (var cal in calendars) {
        cal.addObserver(refreshObserver);
        if (cal.type == "caldav") {
//             idump("refresh requested on " + cal.name);
            cal.refresh();
        } else {
//             idump("refresh not needed for " + cal.name);
            refreshObserver.onLoad(cal);
        }
    }
}

function imipBarRefreshObserver(calendars, callback, data) {
//     idump("imipBarRefreshObserver");
    this.callback = callback;
    this.data = data;
    this.pendingRefresh = calendars.length;

//     idump("  count: " + calendars.length);

    this.allCalendars = calendars;
    this.calendars = {};
    for each (var cal in calendars) {
//         idump("  added " + cal.uri.spec);
        this.calendars[cal.uri.spec] = true;
    }
}
