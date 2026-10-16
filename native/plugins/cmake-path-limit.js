const {withGradleProperties}=require('expo/config-plugins');
module.exports=config=>withGradleProperties(config,mod=>{
  const key='expo.android.cmakeObjectPathMax';
  mod.modResults=mod.modResults.filter(p=>p.key!==key);
  // Expo 58 defaults to 1024; the SDK's default Ninja on Windows needs hashed, shorter paths.
  mod.modResults.push({type:'property',key,value:'240'});
  return mod;
});
