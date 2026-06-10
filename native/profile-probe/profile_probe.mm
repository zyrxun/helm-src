#include <napi.h>
#import <ApplicationServices/ApplicationServices.h>
#import <AppKit/AppKit.h>

// Returns {windowTitle: profileDir} for every Chrome window.
// Walks the AX tree of every Google Chrome process to extract the profile
// directory hint Chrome embeds in window descriptions.
Napi::Value WindowProfiles(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object result = Napi::Object::New(env);

  NSArray<NSRunningApplication*>* apps =
    [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.google.Chrome"];

  for (NSRunningApplication* app in apps) {
    pid_t pid = [app processIdentifier];
    AXUIElementRef axApp = AXUIElementCreateApplication(pid);
    if (!axApp) continue;

    CFArrayRef windows = NULL;
    AXError err = AXUIElementCopyAttributeValue(
      axApp, kAXWindowsAttribute, (CFTypeRef*)&windows);
    if (err == kAXErrorSuccess && windows) {
      CFIndex count = CFArrayGetCount(windows);
      for (CFIndex i = 0; i < count; i++) {
        AXUIElementRef win = (AXUIElementRef)CFArrayGetValueAtIndex(windows, i);
        CFStringRef title = NULL, desc = NULL;
        AXUIElementCopyAttributeValue(win, kAXTitleAttribute, (CFTypeRef*)&title);
        AXUIElementCopyAttributeValue(win, kAXDescriptionAttribute, (CFTypeRef*)&desc);

        NSString* nsTitle = title ? (NSString*)title : nil;
        NSString* nsDesc  = desc  ? (NSString*)desc  : nil;

        // Chrome's window description leaks the profile path, e.g.
        //   "Profile 7 - Google Chrome" or contains "/Profile 7" somewhere.
        NSString* profileDir = nil;
        for (NSString* s in @[nsTitle ?: @"", nsDesc ?: @""]) {
          // Word-anchored so a page literally titled "Profile 4 Guide" doesn't
          // false-attribute. Chrome's real disambiguator sits adjacent to non-word
          // chars (en-dash, slash, parens).
          NSRange r = [s rangeOfString:@"\\b(Default|Profile [0-9]+)\\b"
                               options:NSRegularExpressionSearch];
          if (r.location != NSNotFound) {
            profileDir = [s substringWithRange:r];
            break;
          }
        }
        if (nsTitle && profileDir) {
          result.Set(std::string([nsTitle UTF8String]),
                     std::string([profileDir UTF8String]));
        }
        if (title) CFRelease(title);
        if (desc)  CFRelease(desc);
      }
      CFRelease(windows);
    }
    CFRelease(axApp);
  }
  return result;
}

// Diagnostic: return [{title, description}] for every Chrome window.
Napi::Value WindowsRaw(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array result = Napi::Array::New(env);
  uint32_t idx = 0;

  NSArray<NSRunningApplication*>* apps =
    [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.google.Chrome"];

  for (NSRunningApplication* app in apps) {
    pid_t pid = [app processIdentifier];
    AXUIElementRef axApp = AXUIElementCreateApplication(pid);
    if (!axApp) continue;
    CFArrayRef windows = NULL;
    AXError err = AXUIElementCopyAttributeValue(
      axApp, kAXWindowsAttribute, (CFTypeRef*)&windows);
    if (err == kAXErrorSuccess && windows) {
      CFIndex count = CFArrayGetCount(windows);
      for (CFIndex i = 0; i < count; i++) {
        AXUIElementRef win = (AXUIElementRef)CFArrayGetValueAtIndex(windows, i);
        CFStringRef title = NULL, desc = NULL;
        AXUIElementCopyAttributeValue(win, kAXTitleAttribute, (CFTypeRef*)&title);
        AXUIElementCopyAttributeValue(win, kAXDescriptionAttribute, (CFTypeRef*)&desc);
        Napi::Object entry = Napi::Object::New(env);
        entry.Set("pid", (int)pid);
        entry.Set("title", title ? std::string([(NSString*)title UTF8String]) : "");
        entry.Set("description", desc ? std::string([(NSString*)desc UTF8String]) : "");
        result.Set(idx++, entry);
        if (title) CFRelease(title);
        if (desc) CFRelease(desc);
      }
      CFRelease(windows);
    } else {
      Napi::Object entry = Napi::Object::New(env);
      entry.Set("pid", (int)pid);
      entry.Set("axError", (int)err);
      result.Set(idx++, entry);
    }
    CFRelease(axApp);
  }
  return result;
}

Napi::Value IsTrusted(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), AXIsProcessTrusted());
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("windowProfiles", Napi::Function::New(env, WindowProfiles));
  exports.Set("windowsRaw", Napi::Function::New(env, WindowsRaw));
  exports.Set("isTrusted", Napi::Function::New(env, IsTrusted));
  return exports;
}

NODE_API_MODULE(profile_probe, Init)
