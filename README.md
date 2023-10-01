# Generator Release Notes

This repository provides a GitHub action to <strong>automatically create a release notes</strong> after you creating a tag and wants to create a release notes

## Common usage

Every time you merged your pull request for creating pre-release or release, this Github actions will be running and automatically generate release-notes.

### Preresquite

You must create a tag, before use this Github Actions. If you don't create the tag this Github actions will be failed to generate your release notes. You can use [standard-version](https://github.com/conventional-changelog/standard-version) for generate your tag and changelog.md file.

### Flow

You can see the flow, how this Github actions working:
<p align="center">
  <img src="https://github.com/vhermawan/generator-release-notes/raw/main/images/flow-release.png" alt="Release flow"/>
<p>

### Setup Yaml

You can running this Github actions only in some condition you can use label in pull request. First create a yaml file into your root project directory: `.github/workflows/generate-release-note.yml`:

```yaml
name: Generate Release Notes
on:
  workflow_call:

jobs:
  get-commits:
    runs-on: ubuntu-latest
    steps:
    - name: Check out repository
      uses: actions/checkout@v3
      with:
        fetch-depth: 0
        ref: 'main'

    - name: Generate release notes
      uses: vhermawan/generator-release-notes@v1.0.2
      with:
        owner: <your-username>
        token: ${{ github.token }}
        repository: <your-repository-name>
```
Now you can create a new yaml file, this yaml file will be running in each you create a pull request. This is a example, Github actions `generator-release-note` will be running if your pull request has a `release` label

```yaml
name: Pull Request

on:
  pull_request:
    branches:
      - main

jobs:
  pull-request:
    timeout-minutes: 30
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2

  generate-release-notes:
    if: contains(github.event.pull_request.labels.*.name, 'release')
    needs: pull-request
    uses: ./.github/workflows/generate-release-note.yml
    secrets: inherit
```
