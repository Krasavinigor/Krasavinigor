# Как опубликовать профиль

Создайте **публичный** репозиторий с точным именем `Krasavinigor/Krasavinigor`. Скопируйте в его корень `README.md`, `package.json`, папки `assets/`, `scripts/`, `tests/` и `.github/` из этого пакета. GitHub покажет корневой README на странице вашего профиля.

Перед публикацией просмотрите ссылки и формулировки. `Raincoat` ведёт на публичный [репозиторий проекта](https://github.com/Krasavinigor/Raincoat); в профиле не заявлен размещённый в сети демо-сайт. Блок между `OSS-PRS:START` и `OSS-PRS:END` обновляется автоматически. Текст вне маркеров остаётся под ручным контролем.

После загрузки файлов откройте **Actions → Update selected OSS pull requests → Run workflow**. Затем проверьте историю запусков и итоговый diff README. Workflow также запускается по понедельникам. Стандартный `GITHUB_TOKEN` выдаётся GitHub Actions; отдельный секрет создавать не нужно. Если организационные или репозиторные настройки запрещают запись workflow, разрешите Actions записывать содержимое репозитория (Settings → Actions → General → Workflow permissions → Read and write permissions). При ошибке API workflow завершается с ошибкой и не заменяет предыдущий список.

Локально можно выполнить `npm test`. Для реального обновления используйте Node.js 24 и токен с доступом к публичному API: `GITHUB_TOKEN=... npm run update:oss`. Скрипт делает запросы к GitHub Search и Pull Requests API и записывает только выделенный блок README. Токен не сохраняется в файлах пакета.

Подборка в блоке — **до пяти выбранных внешних merged PR**, а не полный реестр вкладов. Вручную написанные строки об Apache Beam и 25 PR в App Center / CodePush остаются отдельными подтверждёнными фактами. Workflow исключает собственные репозитории и `akvelon/beam`, чтобы не дублировать upstream Apache Beam.

