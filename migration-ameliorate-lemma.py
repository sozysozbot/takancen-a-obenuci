#!/usr/bin/env python3
"""
Ameliorate the lemma forms in migration-step1.json to create migration-step2.json
"""
import json

# When the lemma is a noun, place an acute accent in the third-from-last mora (if shorter than 3, at the initial mora)
# When it is a verb:
#   vowel-stem verbs such as "ata-lu" should be made into "áta-": strip the final "lu" and place the accent at the penultimate vowel
#   consonant-stem verbs such as "mogakug-u" should be made into "mogakúg-": strip the final "u" and place the accent at the ultimate vowel
#   "c-u" and "(a)c-u" should be "ć-" and "(á)c-".
def ameliorate_lemma(src):
    # TODO
    pass

if __name__ == '__main__':
    src = '皇言集書2021-12-11.json'
    result = ameliorate_lemma(src)
    print(json.dumps(result, ensure_ascii=False, indent=2))