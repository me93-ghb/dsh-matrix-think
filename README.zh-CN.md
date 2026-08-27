> 本 README 使用了翻译工具。如果您是中文母语者，并愿意帮助校正译文，请提交 Pull Request。
>
> Translation tools were used for this README. If you are a native Chinese speaker and can help correct it, please submit a pull request.

[English](README.md) | [简体中文](README.zh-CN.md)

# Matrix Think for DSH

Matrix Think for DSH 将 DeepSeek Harness Web 中展开的 Think 输出变成由实时推理文本组成的数字雨。

[![Matrix Think 将实时推理文本变成文字雨](assets/dsh-matrix-think-demo.gif)](assets/dsh-matrix-think-demo.mp4)

[![star velocity](https://afterglow.watch/badge/me93-ghb/dsh-matrix-think?style=flat-square)](https://afterglow.watch)
[![powered by DSH](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MIT license](https://img.shields.io/badge/license-MIT-8A8A8A?style=flat-square)](LICENSE.md)

> 这是一个非官方社区插件，与 DeepSeek AI 没有隶属关系，也未获得其认可。

## 为什么做这个插件

我第一次尝试 DSH，并用 DeepSeek Lightning 运行了几次提示词时，它飞快刷过的思考文本让我很惊讶。我几乎来不及阅读，于是想到：为什么不在模型工作时，把这些文本变成一个有趣的动画？为了再多一点乐趣，我还把模型思考中的每个长破折号都变成了鲸鱼。🐋

## 安装

```sh
dsh plugin --profile web add github:me93-ghb/dsh-matrix-think
dsh web
```

提交提示词，然后在模型运行时展开 **Think**。打开 **Settings**，选择 **Plugins**，再用 **Matrix Think** 开关为当前浏览器开启或关闭效果。

用以下命令移除插件：

```sh
dsh plugin --profile web remove dsh-matrix-think
```

## 工作方式

每个由空白字符分隔的单词会变成一条垂直的文字雨。头部字母先出现，其余字母随后按原顺序形成尾迹。新单词会等待当前文字流离开方框底部。当推理停止时，文字雨也会停止，并按句子顺序排列单词。

画布会读取 DSH 主题中的字体、背景、灰色和 **Deep diving** 的蓝色。画面中至少会有一条可见文字流使用蓝色强调色。长破折号在效果中会显示为鲸鱼 emoji。

插件只在浏览器中运行。它不会发送数据，不会发起网络请求，也没有主机端行为。

## 开发

```sh
pnpm install
pnpm check
pnpm pack
```

将生成的压缩包安装到本地 DSH Web 配置中，以测试组装后的插件：

```sh
dsh plugin --profile web add ./dsh-matrix-think-0.1.0.tgz
```

TypeScript 源码会编译为提交到仓库中的 `lib/client.js` 浏览器包。测试套件会检查设置开关、流式更新时的 DOM 归属、停止状态、主题变量、单词队列、错开的进入时机、蓝色文字流交接、逐字显示和鲸鱼替换。

## 兼容性

DeepSeek Harness 目前处于开发者预览阶段。此插件依赖 Think 行的 `data-variant="think"`、`data-state` 和展开标记。如果 DSH Web 的渲染器发生变化，可能需要更新选择器。
