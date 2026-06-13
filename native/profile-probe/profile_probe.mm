#include <napi.h>
#import <ApplicationServices/ApplicationServices.h>
#import <AppKit/AppKit.h>

// Returns [{title, description}] for every Chrome window. Main process matches
// the profile suffix in JS via SAFE_PROFILE_RE so the parsing rule lives in
// one place; this module only surfaces the raw AX strings.
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
  exports.Set("windowsRaw", Napi::Function::New(env, WindowsRaw));
  exports.Set("isTrusted", Napi::Function::New(env, IsTrusted));
  return exports;
}

NODE_API_MODULE(profile_probe, Init)
