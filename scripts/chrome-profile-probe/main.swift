import Foundation
import ApplicationServices
import AppKit

struct Profile {
    let dir: String
    let name: String
}

func loadProfiles() -> [Profile] {
    let home = FileManager.default.homeDirectoryForCurrentUser
    let url = home.appendingPathComponent("Library/Application Support/Google/Chrome/Local State")
    guard let data = try? Data(contentsOf: url),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let profile = json["profile"] as? [String: Any],
          let cache = profile["info_cache"] as? [String: [String: Any]]
    else { return [] }

    var out: [Profile] = []
    for (dir, info) in cache {
        let name = (info["name"] as? String) ?? dir
        out.append(Profile(dir: dir, name: name))
    }
    out.sort { $0.name.count > $1.name.count }
    return out
}

func axString(_ elem: AXUIElement, _ attr: String) -> String? {
    var value: AnyObject?
    let err = AXUIElementCopyAttributeValue(elem, attr as CFString, &value)
    if err == .success, let s = value as? String, !s.isEmpty { return s }
    return nil
}

func axChildren(_ elem: AXUIElement) -> [AXUIElement] {
    var value: AnyObject?
    let err = AXUIElementCopyAttributeValue(elem, kAXChildrenAttribute as CFString, &value)
    if err == .success, let arr = value as? [AXUIElement] { return arr }
    return []
}

func findProfile(_ elem: AXUIElement, _ profiles: [Profile], _ depth: Int) -> String? {
    if depth > 8 { return nil }
    let haystack = [
        axString(elem, kAXDescriptionAttribute as String),
        axString(elem, kAXTitleAttribute as String),
        axString(elem, kAXHelpAttribute as String),
        axString(elem, kAXValueAttribute as String),
        axString(elem, kAXRoleDescriptionAttribute as String),
    ].compactMap { $0 }.joined(separator: " ")

    if !haystack.isEmpty {
        for p in profiles where p.name.count >= 2 {
            if haystack.contains(p.name) { return p.dir }
        }
    }
    for child in axChildren(elem) {
        if let dir = findProfile(child, profiles, depth + 1) { return dir }
    }
    return nil
}

func emitJSON(_ obj: Any) {
    if let data = try? JSONSerialization.data(withJSONObject: obj),
       let s = String(data: data, encoding: .utf8) {
        print(s)
    } else {
        print("{}")
    }
}

let action = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "list"

switch action {
case "list":
    let arr = loadProfiles().map { ["dir": $0.dir, "name": $0.name] }
    emitJSON(arr)
case "windowProfiles":
    let profiles = loadProfiles()
    if profiles.isEmpty { print("{}"); exit(0) }

    var result: [String: String] = [:]
    let runningChrome = NSRunningApplication
        .runningApplications(withBundleIdentifier: "com.google.Chrome")
    guard let chrome = runningChrome.first else { print("{}"); exit(0) }

    let appElem = AXUIElementCreateApplication(chrome.processIdentifier)
    var winsValue: AnyObject?
    let err = AXUIElementCopyAttributeValue(appElem, kAXWindowsAttribute as CFString, &winsValue)
    guard err == .success, let windows = winsValue as? [AXUIElement] else {
        print("{}"); exit(0)
    }

    for win in windows {
        let title = axString(win, kAXTitleAttribute as String) ?? ""
        if title.isEmpty { continue }
        if let dir = findProfile(win, profiles, 0) {
            result[title] = dir
        }
    }
    emitJSON(result)
default:
    print("{}")
}
