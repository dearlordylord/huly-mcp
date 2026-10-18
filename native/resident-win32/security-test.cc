#include "security.h"

#include <aclapi.h>
#include <bcrypt.h>
#include <sddl.h>
#include <stdio.h>
#include <strsafe.h>

using huly::resident::win32::Failure;
using huly::resident::win32::Handle;
using huly::resident::win32::inspect_ancestor;
using huly::resident::win32::inspect_private;
using huly::resident::win32::LocalAllocation;
using huly::resident::win32::ObjectIdentity;
using huly::resident::win32::PrivateSecurity;
using huly::resident::win32::same_object;
using huly::resident::win32::UserIdentity;

namespace {
constexpr DWORD sharing = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE;
constexpr DWORD owner_access = READ_CONTROL | WRITE_DAC | DELETE | FILE_READ_ATTRIBUTES;

bool report(const char* name, bool passed) noexcept {
  printf("{\"case\":\"%s\",\"passed\":%s}\n", name, passed ? "true" : "false");
  return passed;
}

bool apply_dacl(HANDLE object, PSECURITY_DESCRIPTOR descriptor) noexcept {
  BOOL present = FALSE;
  BOOL defaulted = FALSE;
  PACL acl = nullptr;
  if (!GetSecurityDescriptorDacl(descriptor, &present, &acl, &defaulted) || !present) return false;
  return SetSecurityInfo(object, SE_FILE_OBJECT,
                         DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION, nullptr,
                         nullptr, acl, nullptr) == ERROR_SUCCESS;
}

bool set_world_read(HANDLE object) noexcept {
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(L"D:P(A;;GR;;;WD)", SDDL_REVISION_1,
                                                            &descriptor, nullptr))
    return false;
  LocalAllocation owned;
  owned.take(descriptor);
  return apply_dacl(object, descriptor);
}

bool set_world_mutation(HANDLE object) noexcept {
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(L"D:P(A;;GW;;;WD)", SDDL_REVISION_1,
                                                            &descriptor, nullptr))
    return false;
  LocalAllocation owned;
  owned.take(descriptor);
  return apply_dacl(object, descriptor);
}

bool set_world_child_creation(HANDLE object) noexcept {
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(L"D:P(A;;0x00000004;;;WD)",
                                                            SDDL_REVISION_1, &descriptor, nullptr))
    return false;
  LocalAllocation owned;
  owned.take(descriptor);
  return apply_dacl(object, descriptor);
}

class Fixture final {
 public:
  ~Fixture() { cleanup(); }
  Fixture() noexcept = default;
  Fixture(const Fixture&) = delete;
  Fixture& operator=(const Fixture&) = delete;
  bool initialize(PrivateSecurity& security) noexcept {
    WCHAR temporary[32768] = {};
    const DWORD count = GetTempPathW(sizeof(temporary) / sizeof(temporary[0]), temporary);
    if (count == 0 || count >= sizeof(temporary) / sizeof(temporary[0])) return false;
    BYTE random[16] = {};
    if (BCryptGenRandom(nullptr, random, sizeof(random), BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0)
      return false;
    WCHAR suffix[33] = {};
    constexpr WCHAR hex[] = L"0123456789abcdef";
    for (size_t index = 0; index < sizeof(random); ++index) {
      suffix[index * 2] = hex[random[index] >> 4];
      suffix[index * 2 + 1] = hex[random[index] & 15];
    }
    if (FAILED(StringCchPrintfW(directory_path_,
                                sizeof(directory_path_) / sizeof(directory_path_[0]),
                                L"%lsresident-security-%ls", temporary, suffix)))
      return false;
    if (!CreateDirectoryW(directory_path_, security.attributes())) return false;
    directory_created_ = true;
    directory.reset(CreateFileW(directory_path_, owner_access, sharing, nullptr, OPEN_EXISTING,
                                FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
                                nullptr));
    if (!directory.valid()) return false;
    if (FAILED(StringCchPrintfW(file_path_, sizeof(file_path_) / sizeof(file_path_[0]),
                                L"%ls\\record.json", directory_path_)))
      return false;
    file.reset(CreateFileW(file_path_, owner_access | GENERIC_READ | GENERIC_WRITE, sharing,
                           security.attributes(), CREATE_NEW,
                           FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
    return file.valid();
  }
  Handle observe_file() const noexcept {
    return Handle(CreateFileW(file_path_, READ_CONTROL | FILE_READ_ATTRIBUTES, sharing, nullptr,
                              OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
  }
  bool cleanup() noexcept {
    bool success = true;
    FILE_DISPOSITION_INFO disposition = {TRUE};
    if (file.valid()) {
      success = SetFileInformationByHandle(file.get(), FileDispositionInfo, &disposition,
                                           sizeof(disposition)) != FALSE;
      success = file.close() && success;
    }
    if (directory.valid()) {
      success = (SetFileInformationByHandle(directory.get(), FileDispositionInfo, &disposition,
                                            sizeof(disposition)) != FALSE) &&
                success;
      success = directory.close() && success;
      if (success) {
        const DWORD remaining = GetFileAttributesW(directory_path_);
        const DWORD error = GetLastError();
        success = remaining == INVALID_FILE_ATTRIBUTES &&
                  (error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND);
        if (success) directory_created_ = false;
      }
    }
    return !directory_created_ && success;
  }
  Handle directory;
  Handle file;

 private:
  WCHAR directory_path_[32768] = {};
  WCHAR file_path_[32768] = {};
  bool directory_created_ = false;
};
}  // namespace

int wmain() {
  UserIdentity user;
  if (!report("process-token-user", user.initialize() == Failure::none)) return 1;
  PrivateSecurity security;
  if (!report("creation-descriptor", security.initialize(user) == Failure::none)) return 1;
  Fixture fixture;
  if (!report("private-creation", fixture.initialize(security))) return 1;
  ObjectIdentity directory;
  ObjectIdentity file;
  if (!report("private-directory",
              inspect_private(fixture.directory.get(), user, &directory) == Failure::none &&
                  directory.directory))
    return 1;
  if (!report("private-file",
              inspect_private(fixture.file.get(), user, &file) == Failure::none && !file.directory))
    return 1;
  if (!report("different-object", !same_object(directory, file))) return 1;
  Handle observer = fixture.observe_file();
  ObjectIdentity observed;
  if (!report("same-object",
              observer.valid() &&
                  inspect_private(observer.get(), user, &observed) == Failure::none &&
                  same_object(file, observed)))
    return 1;
  if (!report("close-observer", observer.close())) return 1;
  if (!report("file-not-ancestor",
              inspect_ancestor(fixture.file.get(), user) == Failure::permission))
    return 1;
  if (!report("world-read-descriptor", set_world_read(fixture.file.get()))) return 1;
  ObjectIdentity rejected;
  if (!report("reject-world-read",
              inspect_private(fixture.file.get(), user, &rejected) == Failure::permission))
    return 1;
  if (!report("restore-file",
              apply_dacl(fixture.file.get(), security.attributes()->lpSecurityDescriptor)))
    return 1;
  if (!report("null-dacl",
              SetSecurityInfo(fixture.file.get(), SE_FILE_OBJECT,
                              DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                              nullptr, nullptr, nullptr, nullptr) == ERROR_SUCCESS))
    return 1;
  if (!report("reject-null-dacl",
              inspect_private(fixture.file.get(), user, &rejected) == Failure::permission))
    return 1;
  if (!report("restore-null-dacl",
              apply_dacl(fixture.file.get(), security.attributes()->lpSecurityDescriptor)))
    return 1;
  if (!report("world-readable-ancestor",
              set_world_read(fixture.directory.get()) &&
                  inspect_ancestor(fixture.directory.get(), user) == Failure::none))
    return 1;
  if (!report("ancestor-not-private",
              inspect_private(fixture.directory.get(), user, &rejected) == Failure::permission))
    return 1;
  if (!report("new-child-only-ancestor",
              set_world_child_creation(fixture.directory.get()) &&
                  inspect_ancestor(fixture.directory.get(), user) == Failure::none))
    return 1;
  if (!report("mutating-ancestor",
              set_world_mutation(fixture.directory.get()) &&
                  inspect_ancestor(fixture.directory.get(), user) == Failure::permission))
    return 1;
  if (!report("restore-ancestor",
              apply_dacl(fixture.directory.get(), security.attributes()->lpSecurityDescriptor)))
    return 1;
  if (!report("owned-cleanup", fixture.cleanup())) return 1;
  return 0;
}
