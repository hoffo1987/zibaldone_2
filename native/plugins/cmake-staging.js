const {withProjectBuildGradle}=require('expo/config-plugins');
module.exports=config=>withProjectBuildGradle(config,mod=>{
  const marker='// Circuito: optional short CMake staging path for Windows.';
  const snippet=`\n${marker}\ndef circuitoCmakeStagingRoot = findProperty("circuitoCmakeStagingRoot")\nif (circuitoCmakeStagingRoot) {\n  subprojects { project ->\n    ["com.android.application", "com.android.library"].each { pluginId ->\n      project.plugins.withId(pluginId) {\n        project.android.externalNativeBuild.cmake.buildStagingDirectory = new File(circuitoCmakeStagingRoot.toString(), project.name)\n      }\n    }\n  }\n}\n`;
  if(!mod.modResults.contents.includes(marker))mod.modResults.contents=mod.modResults.contents.replace('apply plugin: "expo-root-project"',snippet+'\napply plugin: "expo-root-project"');
  return mod;
});
