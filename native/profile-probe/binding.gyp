{
  "targets": [
    {
      "target_name": "profile_probe",
      # Objective-C++ against AppKit — there is nothing to build off macOS, and
      # without this the Windows packaging run dies trying to compile a .mm.
      # darwin.js already require()s this in a try/catch, so a missing binary
      # is a supported state.
      "conditions": [
        [ "OS!='mac'", { "type": "none", "sources": [] } ]
      ],
      "sources": [ "profile_probe.mm" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "NO",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "11.0",
        "OTHER_CFLAGS": [ "-ObjC++" ],
        "OTHER_LDFLAGS": [
          "-framework", "ApplicationServices",
          "-framework", "AppKit",
          "-framework", "Foundation"
        ]
      }
    }
  ]
}
