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
 * The Initial Developer of the Original Code is
 * Sun Microsystems, Inc.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Daniel Boelzle <daniel.boelzle@sun.com>
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

var common_onLoad = onLoad;
var common_onAcceptDialog = onAcceptDialog;

onLoad = function ltn_onLoad() {
    gCalendar = window.arguments[0].calendar;

    /* ACL code */
    if (gCalendar.type == "caldav") {
        let calAclEntry = null;
        let aclMgr = Components.classes["@inverse.ca/calendar/caldav-acl-manager;1"]
                               .getService(Components.interfaces.calICalDAVACLManager);
        let opListener = {
            onGetResult: function(calendar, status, itemType, detail, count, items) {
                ASSERT(false, "unexpected!");
            },
            onOperationComplete: function(opCalendar, opStatus, opType, opId, opDetail) {
                calAclEntry = opDetail;
            }
        };
        aclMgr.getCalendarEntry(gCalendar, opListener);

        let menuPopup = document.getElementById("email-identity-menupopup");

        let ownerIdentities = {};
        calAclEntry.getOwnerIdentities({}, ownerIdentities);
        ownerIdentities = ownerIdentities.value;
        for (let i = 0; i < ownerIdentities.length; i++) {
            addMenuItem(menuPopup, ownerIdentities[i].identityName, ownerIdentities[i].key);
        }

        // This should never happend as the CalDAV server should always return us the proper
        // owner's identity - but, we never know.
        if (ownerIdentities.length == 0) {
            addMenuItem(menuPopup, ltnGetString("lightning", "imipNoIdentity"), "none");
        }

        let menuList = document.getElementById("email-identity-menulist");
        menuList.selectedIndex = 0;
    } else {
        ltnInitMailIdentitiesRow();
    }

    common_onLoad();
};

onAcceptDialog = function ltn_onAcceptDialog() {
    ltnSaveMailIdentitySelection();
    return common_onAcceptDialog();
};
