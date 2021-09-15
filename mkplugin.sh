#!/bin/bash

#
# Small helper to create a new plugin skeleton
#

name="$1"
Name="${name^}"

cp -r packages/plugin-template "packages/plugin-$name"
cd "packages/plugin-$name"
rm -rf build
rm *.tsbuildinfo

sed -i "s/template/$name/g" package.json
sed -i '/  "private": true,/d' package.json
sed -i "s/template/$name/g" src/index.ts
sed -i "s/Template/$Name/g" src/index.ts
sed -i "s/Template/$Name/g" src/index.test.ts

cd ../..
