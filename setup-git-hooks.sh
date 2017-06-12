#!/bin/sh

disableHooks="$1"

cp -f ./git-hooks/* ./.git/hooks/

if [ "$disableHooks" = '' ] 
then
    chmod 755 ./.git/hooks/*
else
    chmod 644 ./.git/hooks/*
fi


