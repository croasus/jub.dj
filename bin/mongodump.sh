#! /bin/bash -e

today=$(date -u +"%Y-%m-%d")

mongodump --db jub-dj --out ~/mongodump/$today/ -vvvvv
tar -zcvf ~/thejub.pub-mongodump-$today.tar.gz ~/mongodump/$today/
