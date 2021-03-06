import {
    IDictionary, DEFAULT_LOCALE_LANGUAGE,
    SupportedLocaleLanguages, SUPPORTED_LOCALES, IComponentsType
} from './localization.definitions';
import { Logger } from './../../../widgets/src/common/logger';

/*
* Localization class provides the user the ability
* to localize the strings within UI including messages.
*/
export class Localization {

    private static _dictionary: IDictionary = {};
    private static _localizations: Map<string, IDictionary> = new Map<string, IDictionary>();
    private static _locales: string[] = SUPPORTED_LOCALES;
    private static _currentLocale: string = DEFAULT_LOCALE_LANGUAGE;

    /*
    * Load the resources and set the dictionary with a specific locale.
    * If locale is null, the default locale is 'en'.
    */
    public static load(locale?: string, componentTypes: IComponentsType[] = ['common']) {

        for (const l of this._locales) {
            const dict: IDictionary = {};
            for (const compType of componentTypes) {
                try {
                    const jsonFile = this.getJsonFile(compType, l);
                    if (jsonFile && Object.keys(jsonFile).length) {
                        for (const val in jsonFile) {
                            dict[val] = jsonFile[val];
                        }
                    }
                } catch (error) {
                    Logger.log(error);
                }
            }
            // After import the fileJson add the content to the _localizations map
            // Example: this._localizations = {'en': { }, 'de': { }}
            this._localizations.set(l, dict);
        }

        this.changeLocale(locale);
    }

    public static changeLocale(locale: string) {
        this._currentLocale = this.getMappedLocale(locale);
        this._dictionary = this._localizations.get(this._currentLocale);
    }

    public static translate(keys: string[] | IDictionary, keyPrefix?: string) {
        for (const key in keys) {
            keys[key] = this.resolve(keyPrefix + key);
        }
    }

    public static resolve(key: string): string {
        return this._dictionary[key] || '';
    }

    public static getJsonFile(compType: string, locale: string) {
        return require(`../../../../resources/locales/${compType}/${locale}.json`);
    }

    public static get dictionary() {
        return this._dictionary;
    }

    public static get locale() {
        return this._currentLocale;
    }

    private static getMappedLocale(locale: string) {
        return locale && SupportedLocaleLanguages[locale.toLowerCase()] || DEFAULT_LOCALE_LANGUAGE;
    }
}
