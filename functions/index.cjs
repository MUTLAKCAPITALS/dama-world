'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {onCall}=require('firebase-functions/v2/https');
const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const {makeService}=require('./service.cjs');
initializeApp();
const service=makeService(getFirestore(),getAuth());
// These limits bound concurrency, not the monthly bill. Activation needs Blaze approval.
const limits={region:'us-central1',minInstances:0,maxInstances:2,concurrency:20,memory:'256MiB',timeoutSeconds:60};
exports.damaOnline=onCall(limits,request=>service.online(request));
exports.damaDeleteAccount=onCall(limits,request=>service.requestDeletion(request));
exports.damaCleanDeletedAccount=onDocumentCreated({...limits,document:'accountDeletions/{uid}',retry:true,timeoutSeconds:540},event=>service.cleanDeletion(event.params.uid));
