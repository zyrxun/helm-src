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
default:
    print("{}")
}
