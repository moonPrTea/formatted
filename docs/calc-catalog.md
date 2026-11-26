# Calc function catalog

530 names from LibreOffice **25.8.0.4**, with Russian translations and categories. Includes the core and bundled Analysis, Date and Pricing add-ins, including compatibility aliases. Excludes suppressed functions and user-installed extensions. Untranslated names retain the English spelling. This is a catalog, not a calculation implementation.

The generated [catalog data](../sheets/app/services/catalog-data.ts) is derived from LibreOffice source resources, licensed under [MPL 2.0](https://www.mozilla.org/MPL/2.0/). Copyright belongs to the LibreOffice contributors; resource headers also acknowledge Apache Software Foundation contributions. The extraction script is ours. No implementation code or function descriptions are copied.

## Reproduce

Download these files into a temporary directory, preserving the local names below. Both repositories must use tag `libreoffice-25.8.0.4`.

| Local name | Repository path |
| --- | --- |
| lo-functions.hrc | core: formula/inc/core_resource.hrc |
| lo-funcdesc.cxx | core: sc/source/core/data/funcdesc.cxx |
| lo-addon-strings.hrc | core: scaddins/inc/strings.hrc |
| lo-addon-functions.cxx | core: scaddins/source/analysis/analysishelper.cxx |
| lo-datefunc.cxx | core: scaddins/source/datefunc/datefunc.cxx |
| lo-pricing.cxx | core: scaddins/source/pricing/pricing.cxx |
| lo-ru.po | translations: source/ru/formula/messages.po |
| lo-addon-ru.po | translations: source/ru/scaddins/messages.po |

Sources: [core](https://github.com/LibreOffice/core/tree/libreoffice-25.8.0.4), [translations](https://github.com/LibreOffice/translations/tree/libreoffice-25.8.0.4). Analysis duplicate-name suffix rules are in `scaddins/source/analysis/analysis.cxx`.

Run `npm run build`, then `node build/sheets/scripts/calc-catalog.js <directory>`. It prints the generated TypeScript to stdout. Compare it with `sheets/app/services/catalog-data.ts` before replacing the snapshot. Runtime search is entirely offline.
