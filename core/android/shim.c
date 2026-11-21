// Android's C library (Bionic) has no pthread_setcancelstate, pthread_setcanceltype or
// pthread_attr_setinheritsched, which Odin's core:thread calls; the core never cancels threads
// or changes scheduling, so these do nothing.
int pthread_setcancelstate(int state, int *old) { (void)state; if (old) *old = 0; return 0; }
int pthread_setcanceltype(int type, int *old) { (void)type; if (old) *old = 0; return 0; }
int pthread_attr_setinheritsched(void *attr, int inherit) { (void)attr; (void)inherit; return 0; }

// Bionic on arm64 won't start a program whose thread-local segment is aligned to less than 64
// bytes; one 64-aligned thread-local raises the whole segment.
__attribute__((used, aligned(64))) __thread char pp_tls_align[64];
