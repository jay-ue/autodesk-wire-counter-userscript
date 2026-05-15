# Autodesk Viewer Wire Counter

Autodesk Viewer 线管统计油猴脚本。

## 安装地址

打开下面的 raw 地址，Tampermonkey 会提示安装：

https://raw.githubusercontent.com/jay-ue/autodesk-wire-counter-userscript/main/autodesk-wire-counter.user.js

## 更新方式

脚本头部已写入 `@updateURL` 和 `@downloadURL`，以后只要 GitHub 上的版本号增加，Tampermonkey 就可以检查到更新。

当前版本：`0.8.1`

v0.8.0 重点：新增“校准ID”，导入旧 JSON 后可按构件ID批量校准当前模型里的 dbId；表格和悬停提示继续只露出构件ID。

v0.8.1 重点：选中已统计线管或表格行时，自动把该行的回路编号、回路名称、导线型号和线数带回上方表单，方便补录同回路漏项。
