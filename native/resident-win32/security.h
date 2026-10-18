#ifndef HULY_RESIDENT_WIN32_SECURITY_H
#define HULY_RESIDENT_WIN32_SECURITY_H

#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0602
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>

namespace huly::resident::win32 {

enum class Failure { none, input, unsupported, permission, io, conflict };

class Handle final {
 public:
  explicit Handle(HANDLE value = INVALID_HANDLE_VALUE) noexcept : value_(value) {}
  ~Handle() { close(); }
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
  HANDLE get() const noexcept { return value_; }
  bool valid() const noexcept { return value_ != nullptr && value_ != INVALID_HANDLE_VALUE; }
  void reset(HANDLE value = INVALID_HANDLE_VALUE) noexcept {
    close();
    value_ = value;
  }
  bool close() noexcept {
    if (!valid()) return true;
    const HANDLE owned = value_;
    value_ = INVALID_HANDLE_VALUE;
    return CloseHandle(owned) != FALSE;
  }

 private:
  HANDLE value_;
};

class LocalAllocation final {
 public:
  LocalAllocation() noexcept = default;
  ~LocalAllocation() {
    if (value_ != nullptr) LocalFree(value_);
  }
  LocalAllocation(const LocalAllocation&) = delete;
  LocalAllocation& operator=(const LocalAllocation&) = delete;
  void take(HLOCAL value) noexcept {
    if (value_ != nullptr) LocalFree(value_);
    value_ = value;
  }

 private:
  HLOCAL value_ = nullptr;
};

class UserIdentity final {
 public:
  Failure initialize() noexcept;
  PSID sid() const noexcept { return ready_ ? const_cast<BYTE*>(bytes_) : nullptr; }

 private:
  alignas(void*) BYTE bytes_[SECURITY_MAX_SID_SIZE] = {};
  bool ready_ = false;
};

class PrivateSecurity final {
 public:
  Failure initialize(const UserIdentity& user) noexcept;
  SECURITY_ATTRIBUTES* attributes() noexcept { return ready_ ? &attributes_ : nullptr; }

 private:
  LocalAllocation descriptor_;
  SECURITY_ATTRIBUTES attributes_ = {};
  bool ready_ = false;
};

struct ObjectIdentity final {
  ULONGLONG volume = 0;
  BYTE file[16] = {};
  bool directory = false;
};

bool same_object(const ObjectIdentity& a, const ObjectIdentity& b) noexcept;
Failure inspect_private(HANDLE object, const UserIdentity& user, ObjectIdentity* identity) noexcept;
Failure inspect_ancestor(HANDLE object, const UserIdentity& user) noexcept;

}  // namespace huly::resident::win32
#endif
