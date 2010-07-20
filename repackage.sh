#!/bin/bash -e

# Variables
BASE="`pwd`"
DATE="`date +%Y%m%d%H%M%S`"
VERSION=1.0b2i+1

# Cleanin up the leftovers
alias cp=cp
rm -rf ./tmp/*
rm -rf ./output/*

function setup_cpp {
    cppdefs=""
    case $arch in
        mac)
            cppdefs="-DXP_MACOSX -DXP_UNIX";
            ;;
        linux*)
            cppdefs="-DXP_UNIX";
            ;;
        *)
            ;;
    esac
}

function build {
    rm -rf $BASE/tmp
    cd $BASE
    /usr/bin/unzip binaries/lightning-1.0b2_${arch}.xpi -d tmp

    # We uncompress our archives
    cd $BASE/tmp/chrome/
    unzip -x calendar.jar
    unzip -x lightning.jar

    # We update chrome-related files
    cp -fr $BASE/src/calendar/base/themes/common/* skin/calendar/
    if [ "$arch" == "mac" ]
    then
        cp -fr $BASE/src/calendar/base/themes/pinstripe/* skin/calendar/;
    else
        cp -fr $BASE/src/calendar/base/themes/winstripe/* skin/calendar/;
    fi
    mv -f skin/calendar/widgets/images/* skin/calendar/widgets/
    rm -rf skin/calendar/widgets/images
    mv -f skin/calendar/images/* skin/calendar/
    rm -rf skin/calendar/images
    mv -f skin/calendar/dialogs/images/* skin/calendar/
    rm -rf skin/calendar/dialogs/images
    mv -f skin/calendar/dialogs/* skin/calendar/
    rm -rf skin/calendar/dialogs
    rm -rf skin/calendar/preferences

    cp -fr $BASE/src/calendar/base/content/* content/calendar/
    mv -f content/calendar/dialogs/* content/calendar/
    mv -f content/calendar/widgets/calendar-subscriptions-list.xml content/calendar/
    rm -f content/calendar/*.inc

    # calendar-print-dialog.js
    cd content/calendar/
    for x in calendar-print-dialog.js calendar-common-sets.xul calendar-dnd-listener.js calendar-migration-dialog.js
    do
        python $BASE/tools/Preprocessor.py $cppdefs $x > cpp.out;
        mv -f cpp.out $x;
    done

    cd $BASE/tmp/chrome/
    cp -fr $BASE/src/calendar/lightning/content/imip-* content/lightning/
    cp -fr $BASE/src/calendar/lightning/content/messenger-overlay* content/lightning/

    # messenger-overlay-sidebar.xul must be preprocessed
    cd $BASE/src/calendar/lightning/content/
    python $BASE/tools/Preprocessor.py $cppdefs messenger-overlay-sidebar.xul > $BASE/tmp/chrome/content/lightning/messenger-overlay-sidebar.xul

    # cd $BASE/tmp/js
    # patch -p4 < $BASE/src/patches/468846.diff

    cd $BASE/tmp/chrome/
    rm -f calendar.jar; zip -9r calendar.jar content/calendar skin/calendar
    rm -f lightning.jar; zip -9r lightning.jar content/lightning skin/lightning
    rm -rf content skin

    # We update the preference file
    cd $BASE
    cat src/calendar/lightning/content/lightning.js | sed -e "s/^#expand\ //" -e "s@__LIGHTNING_VERSION__@$VERSION@" > tmp/defaults/preferences/lightning.js
    # DOS version of lightning.js has \r\n line endings
    if [ "$arch" == "win32" ]
    then
        cat tmp/defaults/preferences/lightning.js | sed -e "s@\$@\r@g" > tmp/defaults/preferences/lightning-win32.js;
        mv -f tmp/defaults/preferences/lightning-win32.js tmp/defaults/preferences/lightning.js;
    fi

    # We update the JavaScript core files
    cp -f src/calendar/base/src/*.js tmp/calendar-js/
    cp -f src/calendar/providers/composite/*.js tmp/components/
    cp -f src/calendar/providers/caldav/*.js tmp/calendar-js/
    cp -f src/calendar/providers/storage/*.js tmp/calendar-js/
    cp -f src/calendar/providers/storage/*.jsm tmp/modules/
    mv -f tmp/calendar-js/*CalendarModule.js tmp/components/
    mv -f tmp/calendar-js/calItemModule.js tmp/components/
    rm -f tmp/calendar-js/calApplicationUtils.js

    # We update the locales
    cd $BASE/src/calendar/locales/
    for lang in "en-US" `cat shipped-locales`
    do
        cd $BASE/src/calendar/locales/
        if [ -d $lang ];
        then
            echo "Generating locale $lang...";
            mkdir -p $BASE/tmp/chrome/locale/$lang;
            for package in calendar lightning;
            do
                cp -a $lang/chrome/$package $BASE/tmp/chrome/locale/$lang/$package;
            done;
            cd $BASE/tmp/chrome;
            if [ -f locale/$lang/calendar/providers/wcap/wcap.properties ];
            then
                mv -f locale/$lang/calendar/providers/wcap/wcap.properties locale/$lang/calendar/;
                rm -rf locale/$lang/calendar/providers;
            fi;
            if [ -f locale/$lang/calendar/timezones.properties ];
            then
                mv -f locale/$lang/calendar/timezones.properties locale/$lang/lightning/timezones.properties;
            fi;
            rm -f $package-$lang.jar;
            for package in calendar lightning;
            do
                zip -9r $package-$lang.jar locale/$lang/$package;
            done;
            rm -rf locale;
        fi
    done

    # We update the RDF file
    cd $BASE/tmp
    sed s/20100610141629/$DATE/ install.rdf > install.rdf.tmp; mv -f install.rdf.tmp install.rdf
    sed s/1.0b2/${VERSION}/ install.rdf > install.rdf.tmp; mv -f install.rdf.tmp install.rdf
    sed s/"name>Lightning<"/"name>Lightning (Inverse Edition)<"/ install.rdf > install.rdf.tmp; mv -f install.rdf.tmp install.rdf
    sed s/"http\:\/\/www.mozilla.org\/projects\/calendar\/releases\/lightning.*\.html"/"http\:\/\/inverse.ca\/contributions\/lightning\.html"/ install.rdf > install.rdf.tmp; mv -f install.rdf.tmp install.rdf

    # We regenerate the xpi
    cd $BASE/tmp
    rm -f ../output/lightning-${VERSION}_${arch}.xpi
    zip -9r ../output/lightning-${VERSION}_${arch}.xpi *

    # We exit
    cd $BASE; mv tmp tmp-${arch}; ( rm -rf ./tmp-${arch} ) &
}

for arch in win32 mac linux-i686 linux-x86_64
do
    setup_cpp
    build
done
