// Bionic (Android's libc) lacks these pthread calls that Odin's core:thread
// makes. The core never cancels threads or changes scheduling, so no-ops do.
int pthread_setcancelstate(int state, int *old) { if (old) *old = 0; (void)state; return 0; }
int pthread_setcanceltype(int type, int *old) { if (old) *old = 0; (void)type; return 0; }
struct pthread_attr_t_;
int pthread_attr_setinheritsched(void *attr, int inherit) { (void)attr; (void)inherit; return 0; }

// Bionic on arm64 refuses to start a program whose TLS segment is aligned to
// less than 64 bytes ("TLS segment is underaligned"). Odin's thread-locals are
// aligned to 8, so this one 64-aligned thread-local raises the whole segment.
__attribute__((used, aligned(64))) __thread char pp_tls_align[64];
