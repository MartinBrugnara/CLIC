/* Source: https://www.christianengvall.se/electron-localization/ */

const path = require("path")
const electron = require('electron')
const fs = require('fs');
let loadedLanguage;
let app = electron.app ? electron.app : electron.remote.app

module.exports = i18n;

function i18n() {
    if(fs.existsSync(path.join(__dirname, 'translations',  app.getLocale() + '.json'))) {
        loadedLanguage = JSON.parse(fs.readFileSync(path.join(__dirname, 'translations', app.getLocale() + '.js'), 'utf8'))
    } else {
        loadedLanguage = JSON.parse(fs.readFileSync(path.join(__dirname, 'translations', 'en.json'), 'utf8'))
    }
}

i18n.prototype.__ = function(phrase) {
    let translation = loadedLanguage[phrase]
    if(translation === undefined) {
        translation = phrase
    }
    return translation
}

i18n.prototype.set_locale = function(locale) {
    let fpath = path.join(__dirname, 'translations', locale + '.json');
    if (fs.existsSync(fpath)) {
        loadedLanguage = JSON.parse(fs.readFileSync(fpath, 'utf8'));
        return true;
    } else {
        console.error("[i18n] Error loading " + locale);
        return false;
    }
}
