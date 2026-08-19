# Changelog

このリポジトリでは、Chrome版とEdge版を別々に利用・調整してきた履歴を保持しています。

## Chrome v0.4.5

- Calendar予定作成ショートカットを `Cmd + Shift + L` / `Ctrl + Shift + L` に変更
- Task作成ショートカットは `Cmd + Shift + K` / `Ctrl + Shift + K`
- Calendar / Taskモードを保持し、Googleカレンダー側で自動入力
- Taskモードでタスクタブへの自動切替と詳細欄への入力に対応
- 既存のGoogleカレンダータブ / ウィンドウがある場合は再利用

### Chrome v0.4.4

- TaskモードでGoogle Tasksの詳細欄が空になる問題を修正
- Task詳細欄向けの入力欄・詳細追加ボタン検出を追加

### Chrome v0.4.3

- TaskモードでGoogleカレンダー作成フォームの「タスク」タブへの自動切替を追加
- Task詳細はプレーンテキスト寄せで入力

### Chrome v0.4.2

- Taskモードを追加
- Calendar / Taskのモード情報を保存するよう変更
- content scriptの明示注入対応を維持

## Edge v0.6.1

Edge版はv0.5系以降の利用・調整の中で、Googleカレンダー / TasksのDOM検出と入力処理を繰り返し改善しています。主な内容は以下です。

- Googleカレンダー予定の説明欄検出を改善
- 説明・詳細の追加UIを自動で展開
- リッチテキスト挿入とプレーンテキストのフォールバック
- Taskタブ切替後の描画待ち・詳細欄検出を改善
- GoogleカレンダーのDOM追加を監視して入力を継続
- 同じBacklog課題情報を次の予定へ再入力しないよう、コンテキスト消費処理を改善
- 起動時に開いていたBacklog URLをそのまま登録
- Calendar / Taskの入力成功時に保持情報を消費

> Edge版の旧READMEでは開発中の調整履歴が複数の `v0.6.1` セクションとして残っていました。公開版では、実際のプログラムを変更せず、履歴だけをこのファイルに集約しています。
