class I18n {
    constructor() {
        this.lang = "en";
        this.translations = {};
    }

    async init() {
        const savedLang = localStorage.getItem("agh_lang");

        if (savedLang) {
            this.lang = savedLang;
        } else {
            const browserLang = navigator.language.toLowerCase();

            if (
                browserLang.startsWith("zh") ||
                browserLang.includes("cn")
            ) {
                this.lang = "zh";
            } else {
                this.lang = "en";
            }
        }

        await this.loadLanguage(this.lang);

        const toggle = document.getElementById("lang-switch");

        if (toggle) {
            toggle.addEventListener("click", async () => {
                await this.setLanguage(this.lang === "zh" ? "en" : "zh");
            });
        }
    }

    async loadLanguage(lang) {
        try {
            const response = await fetch(
                `./assets/locales/${lang}.json?v=${Date.now()}`
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to load language: ${lang}`
                );
            }

            this.translations = await response.json();

            this.translatePage();

            document.documentElement.lang = lang;

            document.dispatchEvent(
                new CustomEvent("languageChanged", {
                    detail: {
                        lang: lang
                    }
                })
            );
        } catch (err) {
            console.error(err);
        }
    }

    async setLanguage(lang) {
        this.lang = lang;

        localStorage.setItem(
            "agh_lang",
            lang
        );

        await this.loadLanguage(lang);
    }

    t(key) {
        return (
            this.translations[key] ||
            key
        );
    }

    translatePage() {
        document
            .querySelectorAll("[data-i18n]")
            .forEach((element) => {

                const key =
                    element.dataset.i18n;

                const text =
                    this.t(key);

                element.textContent =
                    text;
            });

        document
            .querySelectorAll("[data-i18n-placeholder]")
            .forEach((element) => {

                const key =
                    element.dataset
                        .i18nPlaceholder;

                element.placeholder =
                    this.t(key);
            });

        document
            .querySelectorAll("[data-i18n-aria-label]")
            .forEach((element) => {

                const key =
                    element.dataset
                        .i18nAriaLabel;

                element.setAttribute(
                    "aria-label",
                    this.t(key)
                );
            });

        const label = document.getElementById("lang-label");

        if (label) {
            label.textContent = this.lang.toUpperCase();
        }

        document.title =
            this.t("app.title");
    }
}

window.i18n = new I18n();

document.addEventListener(
    "DOMContentLoaded",
    async () => {
        await window.i18n.init();
    }
);

window.t = function (key) {
    return window.i18n.t(key);
};
