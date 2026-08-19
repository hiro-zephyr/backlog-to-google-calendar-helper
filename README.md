# Backlog to Google Calendar Helper

Backlogの課題を見ながら「いつやるか」を決め、Googleカレンダーの予定またはGoogle Tasksへ登録するときの転記作業を減らすための、Chrome / Microsoft Edge向けブラウザ拡張です。

> [!WARNING]
> このリポジトリは、個人・一部チームでの利用を目的に作成した**プロトタイプ**を公開するものです。Chrome Web Store / Microsoft Edge Add-onsで正式配布している拡張機能ではありません。GoogleカレンダーのUI変更などにより、予告なく動作しなくなる可能性があります。

## できること

Backlogの課題詳細ページでショートカットキー、またはブラウザのツールバーアイコンから起動すると、表示中の課題から課題キー・件名・URLを取得し、Googleカレンダーを開きます。

Googleカレンダー側で予定作成画面を開くと、課題名やBacklogへのリンクを自動入力します。TaskモードではGoogle Tasks側へ入力します。

この拡張は「いつやるか」を自動で決めません。カレンダーを見ながら、予定を置く時間やTaskにするかどうかは利用者自身が判断する前提です。

## 対応版

| ブラウザ | バージョン | Calendar | Task | 標準ショートカット |
| --- | --- | --- | --- | --- |
| Google Chrome | v0.4.5 | 対応 | 対応 | `Ctrl/Cmd + Shift + L` / `Ctrl/Cmd + Shift + K` |
| Microsoft Edge | v0.6.1 | 対応 | 対応 | `Alt + Shift + L` / `Alt + Shift + K` |

Chrome版とEdge版は、社内利用の中で別々に調整してきたため、現時点ではバージョンと一部実装が異なります。公開にあたりプログラム本体の統合作業は行わず、現在利用しているコードをそのまま収録しています。

## インストール

### Chrome

1. `packages/backlog-to-google-calendar-helper-chrome-v0.4.5.zip` をダウンロードして展開する
2. Chromeで `chrome://extensions/` を開く
3. 「デベロッパーモード」をONにする
4. 「パッケージ化されていない拡張機能を読み込む」を選ぶ
5. 展開したフォルダを指定する
6. 必要に応じて `chrome://extensions/shortcuts` でショートカットを確認・変更する

### Edge

1. `packages/backlog-to-google-calendar-helper-edge-v0.6.1.zip` をダウンロードして展開する
2. Edgeで `edge://extensions/` を開く
3. 「開発者モード」をONにする
4. 「展開して読み込み」を選ぶ
5. 展開したフォルダを指定する
6. 必要に応じて `edge://extensions/shortcuts` でショートカットを確認・変更する

会社や組織が管理するPCでは、ブラウザポリシーによって開発者モードやローカル拡張機能の読み込みが禁止されている場合があります。

## 使い方

### Calendar

1. Backlogの課題詳細ページを開く
2. Calendar用ショートカット、またはブラウザのツールバーアイコンを押す
3. Googleカレンダーへ移動する
4. 登録したい時間枠を選ぶ
5. 自動入力されたタイトル・説明を確認して保存する

### Task

1. Backlogの課題詳細ページを開く
2. Task用ショートカットを押す
3. Googleカレンダー / Tasks側でタイトル・詳細を確認する
4. 必要に応じて内容を編集して保存する

## データの扱い

- Backlog API、Google Calendar API、Google OAuthは使用していません
- 独自の外部サーバーへ課題情報を送信する処理はありません
- 起動時に、表示中のBacklog課題から課題キー・件名・URLを取得します
- 取得した情報は、Googleカレンダーへの入力のため `chrome.storage.local` に一時保存します
- 一時保存した情報は最大約90秒で失効し、入力完了時にも削除する実装です
- 入力補助・失敗時の手動貼り付けのため、課題情報をOSのクリップボードにもコピーします
- **クリップボードへコピーされた情報は、この拡張機能からは自動削除しません**。OSのクリップボード履歴・同期機能を利用している場合は、その設定にも注意してください

詳しくは [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md) を参照してください。

## 注意事項 / 既知の制約

- Googleカレンダーの公開APIではなく画面DOMを利用して入力を補助しているため、GoogleカレンダーのUI変更で動作しなくなる可能性があります
- Googleカレンダーを開いていない場合、現在の実装では `calendar.google.com/calendar/u/0/r` を開きます。複数のGoogleアカウントを使っている場合は、意図したアカウントか確認してください
- ショートカットはOS・ブラウザ・他の拡張機能と競合する場合があります
- Backlog / Googleカレンダーの画面仕様によっては、自動入力に失敗する場合があります。その場合はクリップボードの内容を手動で貼り付けてください
- 本プロトタイプについて、ヌーラボ・BacklogおよびGoogleによる公式サポートはありません

## リポジトリ構成

- `chrome/` : Chrome版 v0.4.5 のソース
- `edge/` : Edge版 v0.6.1 のソース
- `packages/` : 開発者モードで読み込むためのZIP
- `docs/` : データの扱い・公開時の注意事項
- `CHANGELOG.md` : 変更履歴

## ライセンス

現時点ではライセンスファイルを付与していません。利用・改変・再配布条件を明確にする場合は、権利関係を確認したうえでライセンスを追加してください。
