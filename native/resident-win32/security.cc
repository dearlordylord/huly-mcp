#include "security.h"

#include <aclapi.h>
#include <sddl.h>
#include <stddef.h>
#include <strsafe.h>

namespace huly::resident::win32 {
namespace {
constexpr DWORD foreign_ancestor_rights =
    FILE_GENERIC_READ | FILE_GENERIC_EXECUTE | FILE_ADD_SUBDIRECTORY;
constexpr DWORD maximum_aces = 256;

bool well_known(PSID sid, WELL_KNOWN_SID_TYPE kind) noexcept {
  return sid != nullptr && IsValidSid(sid) && IsWellKnownSid(sid, kind);
}

bool is_user(PSID sid, const UserIdentity& user) noexcept {
  return sid != nullptr && user.sid() != nullptr && IsValidSid(sid) && EqualSid(sid, user.sid());
}

bool trusted_owner(PSID sid, const UserIdentity& user, bool leaf) noexcept {
  return is_user(sid, user) || (!leaf && (well_known(sid, WinLocalSystemSid) ||
                                          well_known(sid, WinBuiltinAdministratorsSid)));
}

Failure inspect_allow(const ACE_HEADER* header, const UserIdentity& user, bool leaf) noexcept {
  constexpr size_t sid_offset = offsetof(ACCESS_ALLOWED_ACE, SidStart);
  constexpr size_t minimum_sid = 8;
  if (header->AceSize < sid_offset + minimum_sid) return Failure::permission;
  const auto* ace = reinterpret_cast<const ACCESS_ALLOWED_ACE*>(header);
  auto* sid = const_cast<DWORD*>(&ace->SidStart);
  const auto* sid_bytes = reinterpret_cast<const BYTE*>(sid);
  const DWORD sid_size = GetSidLengthRequired(sid_bytes[1]);
  if (sid_size > header->AceSize - sid_offset || !IsValidSid(sid)) return Failure::permission;
  if (leaf) {
    if (header->AceFlags != 0) return Failure::permission;
    return is_user(sid, user) || well_known(sid, WinLocalSystemSid) ? Failure::none
                                                                    : Failure::permission;
  }
  if ((header->AceFlags & INHERIT_ONLY_ACE) != 0) return Failure::none;
  if (is_user(sid, user) || well_known(sid, WinLocalSystemSid) ||
      well_known(sid, WinBuiltinAdministratorsSid))
    return Failure::none;
  GENERIC_MAPPING mapping = {FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_GENERIC_EXECUTE,
                             FILE_ALL_ACCESS};
  ACCESS_MASK mask = ace->Mask;
  MapGenericMask(&mask, &mapping);
  return (mask & ~foreign_ancestor_rights) == 0 ? Failure::none : Failure::permission;
}

Failure inspect_acl(HANDLE object, const UserIdentity& user, bool leaf) noexcept {
  PSID owner = nullptr;
  PACL acl = nullptr;
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  const DWORD status = GetSecurityInfo(object, SE_FILE_OBJECT,
                                       OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
                                       &owner, nullptr, &acl, nullptr, &descriptor);
  LocalAllocation allocation;
  allocation.take(descriptor);
  if (status != ERROR_SUCCESS) return Failure::io;
  if (!trusted_owner(owner, user, leaf) || acl == nullptr || !IsValidAcl(acl))
    return Failure::permission;
  SECURITY_DESCRIPTOR_CONTROL control = 0;
  DWORD revision = 0;
  if (!GetSecurityDescriptorControl(descriptor, &control, &revision)) return Failure::io;
  if ((control & SE_DACL_PRESENT) == 0 || (leaf && (control & SE_DACL_PROTECTED) == 0))
    return Failure::permission;
  ACL_SIZE_INFORMATION information = {};
  if (!GetAclInformation(acl, &information, sizeof(information), AclSizeInformation))
    return Failure::io;
  if (information.AceCount > maximum_aces) return Failure::permission;
  for (DWORD index = 0; index < information.AceCount; ++index) {
    void* raw = nullptr;
    if (!GetAce(acl, index, &raw) || raw == nullptr) return Failure::permission;
    const auto* header = static_cast<const ACE_HEADER*>(raw);
    if (header->AceType == ACCESS_DENIED_ACE_TYPE) continue;
    if (header->AceType != ACCESS_ALLOWED_ACE_TYPE) return Failure::permission;
    const Failure allowed = inspect_allow(header, user, leaf);
    if (allowed != Failure::none) return allowed;
  }
  return Failure::none;
}

Failure inspect_kind(HANDLE object, bool* directory) noexcept {
  if (GetFileType(object) != FILE_TYPE_DISK) return Failure::permission;
  FILE_ATTRIBUTE_TAG_INFO attributes = {};
  if (!GetFileInformationByHandleEx(object, FileAttributeTagInfo, &attributes, sizeof(attributes)))
    return Failure::io;
  if ((attributes.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) return Failure::permission;
  *directory = (attributes.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
  return Failure::none;
}
}  // namespace

Failure UserIdentity::initialize() noexcept {
  ready_ = false;
  HANDLE raw = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &raw)) return Failure::io;
  Handle token(raw);
  alignas(TOKEN_USER) BYTE buffer[sizeof(TOKEN_USER) + SECURITY_MAX_SID_SIZE] = {};
  DWORD required = 0;
  if (!GetTokenInformation(token.get(), TokenUser, buffer, sizeof(buffer), &required))
    return Failure::io;
  const auto* user = reinterpret_cast<const TOKEN_USER*>(buffer);
  if (!IsValidSid(user->User.Sid) || GetLengthSid(user->User.Sid) > sizeof(bytes_))
    return Failure::permission;
  if (!CopySid(sizeof(bytes_), bytes_, user->User.Sid)) return Failure::io;
  ready_ = true;
  return Failure::none;
}

Failure PrivateSecurity::initialize(const UserIdentity& user) noexcept {
  ready_ = false;
  if (user.sid() == nullptr) return Failure::input;
  LPWSTR sid_text = nullptr;
  if (!ConvertSidToStringSidW(user.sid(), &sid_text)) return Failure::io;
  LocalAllocation text;
  text.take(sid_text);
  WCHAR sddl[512] = {};
  if (FAILED(StringCchPrintfW(sddl, sizeof(sddl) / sizeof(sddl[0]),
                              L"O:%lsD:P(A;;FA;;;%ls)(A;;FA;;;SY)", sid_text, sid_text)))
    return Failure::input;
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, SDDL_REVISION_1, &descriptor,
                                                            nullptr))
    return Failure::io;
  descriptor_.take(descriptor);
  attributes_.nLength = sizeof(attributes_);
  attributes_.lpSecurityDescriptor = descriptor;
  attributes_.bInheritHandle = FALSE;
  ready_ = true;
  return Failure::none;
}

bool same_object(const ObjectIdentity& a, const ObjectIdentity& b) noexcept {
  if (a.volume != b.volume || a.directory != b.directory) return false;
  for (size_t index = 0; index < sizeof(a.file); ++index)
    if (a.file[index] != b.file[index]) return false;
  return true;
}

Failure inspect_private(HANDLE object, const UserIdentity& user,
                        ObjectIdentity* identity) noexcept {
  if (identity == nullptr || user.sid() == nullptr) return Failure::input;
  ObjectIdentity parsed;
  const Failure kind = inspect_kind(object, &parsed.directory);
  if (kind != Failure::none) return kind;
  const Failure access = inspect_acl(object, user, true);
  if (access != Failure::none) return access;
  FILE_ID_INFO native = {};
  if (!GetFileInformationByHandleEx(object, FileIdInfo, &native, sizeof(native)))
    return Failure::unsupported;
  parsed.volume = native.VolumeSerialNumber;
  for (size_t index = 0; index < sizeof(parsed.file); ++index)
    parsed.file[index] = native.FileId.Identifier[index];
  *identity = parsed;
  return Failure::none;
}

Failure inspect_ancestor(HANDLE object, const UserIdentity& user) noexcept {
  if (user.sid() == nullptr) return Failure::input;
  bool directory = false;
  const Failure kind = inspect_kind(object, &directory);
  if (kind != Failure::none) return kind;
  if (!directory) return Failure::permission;
  return inspect_acl(object, user, false);
}
}  // namespace huly::resident::win32
